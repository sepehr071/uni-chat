"""Keycloak OIDC client.

Verifies RS256 access tokens issued by a Keycloak realm directly inside this
process — no proxy / introspection round-trip. Frontend obtains the token via
PKCE (Authorization Code with code_verifier) and POSTs it to
``/api/auth/keycloak/sync``; the route delegates verification + claim parsing
to this module.

Singleton-per-process. OIDC discovery is fetched once and cached forever;
JWKS is cached with a 5-minute TTL and force-refreshed on `kid` miss.
"""
from __future__ import annotations

import logging
import threading
import time
from typing import Optional
from urllib.parse import urlencode

import jwt
import requests
from flask import current_app

logger = logging.getLogger(__name__)

_DISCOVERY_TIMEOUT_S = 10
_JWKS_TIMEOUT_S = 10
_JWKS_TTL_S = 300
_LEEWAY_S = 60


class KeycloakClient:
    """Verifies Keycloak-issued RS256 access tokens.

    Created lazily by :func:`get_keycloak_client`; one instance per process.
    Thread-safe: discovery + JWKS caches are guarded by a single lock.
    """

    def __init__(self, base_url: str, realm: str, client_id: str, expected_audience: str):
        self.base_url = base_url.rstrip('/')
        self.realm = realm
        self.client_id = client_id
        # Many KC realms emit aud=['account'] and the real audience in azp;
        # callers may set EXPECTED_AUDIENCE explicitly, else fall back to client_id.
        self.expected_audience = expected_audience or client_id

        self._lock = threading.Lock()
        self._discovery: Optional[dict] = None
        self._jwks_by_kid: dict[str, dict] = {}
        self._jwks_fetched_at: float = 0.0

    # ---------------- OIDC discovery + JWKS ----------------

    def _discovery_url(self) -> str:
        return f"{self.base_url}/realms/{self.realm}/.well-known/openid-configuration"

    def discover(self) -> dict:
        """Fetch + cache OIDC discovery document. Cached forever after first hit."""
        with self._lock:
            if self._discovery is not None:
                return self._discovery
        # Network call outside the lock — first-hit race is harmless (idempotent).
        resp = requests.get(self._discovery_url(), timeout=_DISCOVERY_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.json()
        with self._lock:
            self._discovery = data
        return data

    def get_jwks(self, force: bool = False) -> dict:
        """Fetch + cache JWKS. 5-minute TTL. ``force=True`` bypasses cache."""
        now = time.time()
        with self._lock:
            cache_fresh = (now - self._jwks_fetched_at) < _JWKS_TTL_S
            if not force and cache_fresh and self._jwks_by_kid:
                return {'keys': list(self._jwks_by_kid.values())}

        discovery = self.discover()
        jwks_uri = discovery.get('jwks_uri')
        if not jwks_uri:
            raise RuntimeError("Keycloak discovery missing 'jwks_uri'")
        resp = requests.get(jwks_uri, timeout=_JWKS_TIMEOUT_S)
        resp.raise_for_status()
        data = resp.json()

        new_index: dict[str, dict] = {}
        for jwk in data.get('keys', []):
            kid = jwk.get('kid')
            if kid:
                new_index[kid] = jwk

        with self._lock:
            self._jwks_by_kid = new_index
            self._jwks_fetched_at = time.time()
        return data

    def _public_key_for(self, kid: str):
        with self._lock:
            jwk_dict = self._jwks_by_kid.get(kid)
        if jwk_dict is None:
            # Maybe key rotated since last fetch — force-refresh once.
            self.get_jwks(force=True)
            with self._lock:
                jwk_dict = self._jwks_by_kid.get(kid)
        if jwk_dict is None:
            raise jwt.InvalidTokenError(f"Unknown signing key id: {kid}")
        # PyJWT 2.x converts JWK -> RSAPublicKey via PyJWK.
        return jwt.PyJWK(jwk_dict).key

    # ---------------- token verification ----------------

    def verify_access_token(self, token: str) -> dict:
        """Verify a Keycloak RS256 access token and return its claims.

        Validates signature, ``iss`` (matches realm URL), ``exp`` (with 60s
        leeway). Audience check is manual to accept ``aud`` OR ``azp`` —
        Keycloak typically emits ``aud=['account']`` with the real audience
        in ``azp``. Raises :class:`jwt.InvalidTokenError` (or a subclass) on
        any failure; never returns None.
        """
        if not token:
            raise jwt.InvalidTokenError("Empty token")

        header = jwt.get_unverified_header(token)
        kid = header.get('kid')
        if not kid:
            raise jwt.InvalidTokenError("Access token missing 'kid' header")
        alg = header.get('alg')
        if alg != 'RS256':
            raise jwt.InvalidTokenError(f"Unexpected JWT alg: {alg!r}")

        public_key = self._public_key_for(kid)
        issuer = f"{self.base_url}/realms/{self.realm}"

        # Decode without aud check; we do it manually below.
        claims = jwt.decode(
            token,
            public_key,
            algorithms=['RS256'],
            issuer=issuer,
            leeway=_LEEWAY_S,
            options={'verify_aud': False, 'require': ['exp', 'iss']},
        )

        aud_claim = claims.get('aud')
        azp_claim = claims.get('azp')
        aud_list = aud_claim if isinstance(aud_claim, list) else ([aud_claim] if aud_claim else [])
        if self.expected_audience not in aud_list and azp_claim != self.expected_audience:
            raise jwt.InvalidAudienceError(
                f"Token audience/azp does not include {self.expected_audience!r}"
            )

        return claims

    # ---------------- claim utilities ----------------

    @staticmethod
    def map_roles(claims: dict) -> str:
        """Map Keycloak realm roles to the internal ``users.role`` enum.

        Highest-priority match wins: ``super-admin`` -> ``admin``,
        ``admin`` -> ``manager``, else ``user``.
        """
        try:
            roles = claims.get('realm_access', {}).get('roles', []) or []
        except AttributeError:
            roles = []
        roles_set = {r for r in roles if isinstance(r, str)}
        if 'super-admin' in roles_set:
            return 'admin'
        if 'admin' in roles_set:
            return 'manager'
        return 'user'

    def extract_profile(self, claims: dict) -> dict:
        """Pull a {sub, email, display_name} dict from KC claims.

        Email synthesis: when the realm doesn't send an `email` claim (common
        when the KC user has no email field or the realm strips it from the
        token), we synthesize ``<preferred_username>@<realm>.kc.local`` so the
        invite-by-email flow (workspace invites, email indexes) keeps working
        without special-casing username-only identities elsewhere.
        """
        sub = claims.get('sub') or ''
        raw_email = (claims.get('email') or '').strip()
        preferred = (claims.get('preferred_username') or '').strip()
        if raw_email:
            email = raw_email
        elif preferred:
            email = f"{preferred}@{self.realm}.kc.local"
        else:
            email = ''
        display_name = (
            claims.get('name')
            or preferred
            or (raw_email.split('@', 1)[0] if raw_email else '')
            or 'User'
        )
        return {
            'sub': str(sub),
            'email': email,
            'display_name': display_name.strip() or 'User',
        }

    # ---------------- federated logout ----------------

    def end_session_url(self, post_logout_redirect_uri: str, id_token_hint: Optional[str] = None) -> str:
        """Build the Keycloak end_session_endpoint URL for federated logout."""
        discovery = self.discover()
        endpoint = discovery.get('end_session_endpoint')
        if not endpoint:
            raise RuntimeError("Keycloak discovery missing 'end_session_endpoint'")
        params: dict[str, str] = {
            'client_id': self.client_id,
            'post_logout_redirect_uri': post_logout_redirect_uri,
        }
        if id_token_hint:
            params['id_token_hint'] = id_token_hint
        sep = '&' if '?' in endpoint else '?'
        return f"{endpoint}{sep}{urlencode(params)}"


# ---------------- module singleton ----------------

_client_lock = threading.Lock()
_client: Optional[KeycloakClient] = None
_client_initialized = False


def get_keycloak_client() -> Optional[KeycloakClient]:
    """Return the process-wide :class:`KeycloakClient`, or ``None`` if SSO is off.

    SSO is considered disabled when ``KEYCLOAK_URL`` is blank. The first call
    reads ``KEYCLOAK_URL/REALM/CLIENT_ID/EXPECTED_AUDIENCE`` from
    ``current_app.config`` and constructs the singleton; later calls return it.
    """
    global _client, _client_initialized
    with _client_lock:
        if _client_initialized:
            return _client
        try:
            cfg = current_app.config
        except RuntimeError:
            # No app context — caller will retry on a real request.
            return None
        url = (cfg.get('KEYCLOAK_URL') or '').strip().rstrip('/')
        realm = (cfg.get('KEYCLOAK_REALM') or '').strip()
        client_id = (cfg.get('KEYCLOAK_CLIENT_ID') or '').strip()
        expected_aud = (cfg.get('KEYCLOAK_EXPECTED_AUDIENCE') or '').strip()
        if not url or not realm or not client_id:
            _client = None
            _client_initialized = True
            logger.info('Keycloak SSO disabled (KEYCLOAK_URL/REALM/CLIENT_ID not all set)')
            return None
        _client = KeycloakClient(
            base_url=url,
            realm=realm,
            client_id=client_id,
            expected_audience=expected_aud or client_id,
        )
        _client_initialized = True
        logger.info('Keycloak SSO enabled: realm=%s client_id=%s', realm, client_id)
        return _client


def reset_keycloak_client() -> None:
    """Test helper — drop the singleton so the next call re-reads config."""
    global _client, _client_initialized
    with _client_lock:
        _client = None
        _client_initialized = False
