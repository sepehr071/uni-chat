import * as oauth from 'oauth4webapi'

// Keycloak public client (PKCE, no secret) wrapper around oauth4webapi.
//
// Strategy:
//  - init() resolves config from Vite env vars first, then falls back to
//    GET /api/auth/keycloak/config (backend echoes the same shape).
//  - Issuer metadata discovery is cached for the lifetime of the page so
//    we only round-trip once per session.
//  - PKCE artefacts (verifier/state/nonce) live in sessionStorage so the
//    redirect-back flow can pick them up. They are cleaned up on success
//    OR failure in handleCallback().

const SS_VERIFIER = 'kc_code_verifier'
const SS_STATE = 'kc_state'
const SS_NONCE = 'kc_nonce'

const REDIRECT_PATH = '/login/callback'

const noScheme = (s) => typeof s === 'string' && s.length > 0

let config = null // { url, realm, client_id } | null
let configLoaded = false
let discoveryPromise = null
let asPromise = null // AuthorizationServer cached

async function loadConfig() {
  if (configLoaded) return config
  configLoaded = true

  const envUrl = import.meta.env?.VITE_KEYCLOAK_URL
  const envRealm = import.meta.env?.VITE_KEYCLOAK_REALM
  const envClient = import.meta.env?.VITE_KEYCLOAK_CLIENT_ID

  if (noScheme(envUrl) && noScheme(envRealm) && noScheme(envClient)) {
    config = {
      url: envUrl.replace(/\/+$/, ''),
      realm: envRealm,
      client_id: envClient,
    }
    return config
  }

  // Fallback: ask the backend. Endpoint is unauthenticated by contract.
  try {
    const res = await fetch('/api/auth/keycloak/config', {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      config = null
      return null
    }
    const data = await res.json().catch(() => ({}))
    const url = data?.url
    const realm = data?.realm
    const client_id = data?.client_id
    if (noScheme(url) && noScheme(realm) && noScheme(client_id)) {
      config = {
        url: String(url).replace(/\/+$/, ''),
        realm,
        client_id,
      }
      return config
    }
    config = null
    return null
  } catch {
    config = null
    return null
  }
}

function issuerUrl() {
  if (!config) throw new Error('Keycloak is not configured')
  return new URL(`${config.url}/realms/${config.realm}`)
}

function getClient() {
  if (!config) throw new Error('Keycloak is not configured')
  return {
    client_id: config.client_id,
    token_endpoint_auth_method: 'none', // public client
  }
}

async function discover() {
  if (asPromise) return asPromise
  asPromise = (async () => {
    const issuer = issuerUrl()
    const res = await oauth.discoveryRequest(issuer, { algorithm: 'oidc' })
    const as = await oauth.processDiscoveryResponse(issuer, res)
    return as
  })()
  return asPromise
}

function redirectUri() {
  return `${window.location.origin}${REDIRECT_PATH}`
}

function normalizeTokens(tokenSet) {
  return {
    access_token: tokenSet.access_token,
    refresh_token: tokenSet.refresh_token,
    id_token: tokenSet.id_token,
    expires_in: tokenSet.expires_in,
  }
}

const keycloakClient = {
  async init() {
    if (!configLoaded) {
      await loadConfig()
    }
    if (config && !discoveryPromise) {
      // Kick off (but don't await) discovery so first redirect is faster.
      discoveryPromise = discover().catch(() => null)
    }
  },

  isEnabled() {
    return !!(config && config.url && config.realm && config.client_id)
  },

  async loginRedirect() {
    await this.init()
    if (!this.isEnabled()) {
      throw new Error('Keycloak SSO is not configured')
    }

    const as = await discover()
    const client = getClient()

    const code_verifier = oauth.generateRandomCodeVerifier()
    const code_challenge = await oauth.calculatePKCECodeChallenge(code_verifier)
    const state = oauth.generateRandomState()
    const nonce = oauth.generateRandomNonce()

    sessionStorage.setItem(SS_VERIFIER, code_verifier)
    sessionStorage.setItem(SS_STATE, state)
    sessionStorage.setItem(SS_NONCE, nonce)

    const authorizationUrl = new URL(as.authorization_endpoint)
    authorizationUrl.searchParams.set('client_id', client.client_id)
    authorizationUrl.searchParams.set('redirect_uri', redirectUri())
    authorizationUrl.searchParams.set('response_type', 'code')
    authorizationUrl.searchParams.set('scope', 'openid email profile')
    authorizationUrl.searchParams.set('code_challenge', code_challenge)
    authorizationUrl.searchParams.set('code_challenge_method', 'S256')
    authorizationUrl.searchParams.set('state', state)
    authorizationUrl.searchParams.set('nonce', nonce)

    window.location.assign(authorizationUrl.toString())

    // Return a never-resolving promise so callers don't proceed after redirect.
    return new Promise(() => {})
  },

  async handleCallback() {
    await this.init()
    if (!this.isEnabled()) {
      throw new Error('Keycloak SSO is not configured')
    }

    const as = await discover()
    const client = getClient()

    const code_verifier = sessionStorage.getItem(SS_VERIFIER)
    const expected_state = sessionStorage.getItem(SS_STATE)
    const expected_nonce = sessionStorage.getItem(SS_NONCE)

    try {
      if (!code_verifier || !expected_state) {
        throw new Error('Missing PKCE/state in session — start sign-in again')
      }

      const currentUrl = new URL(window.location.href)

      // validateAuthResponse throws on state mismatch / OAuth error params.
      const params = oauth.validateAuthResponse(as, client, currentUrl, expected_state)

      const tokenResponse = await oauth.authorizationCodeGrantRequest(
        as,
        client,
        oauth.None(),
        params,
        redirectUri(),
        code_verifier,
      )

      const result = await oauth.processAuthorizationCodeResponse(as, client, tokenResponse, {
        expectedNonce: expected_nonce || undefined,
        requireIdToken: true,
      })

      return normalizeTokens(result)
    } finally {
      sessionStorage.removeItem(SS_VERIFIER)
      sessionStorage.removeItem(SS_STATE)
      sessionStorage.removeItem(SS_NONCE)
    }
  },

  async refresh(refreshToken) {
    await this.init()
    if (!this.isEnabled()) {
      throw new Error('Keycloak SSO is not configured')
    }
    if (!refreshToken) {
      throw new Error('No refresh token')
    }

    const as = await discover()
    const client = getClient()

    const tokenResponse = await oauth.refreshTokenGrantRequest(
      as,
      client,
      oauth.None(),
      refreshToken,
    )

    const result = await oauth.processRefreshTokenResponse(as, client, tokenResponse)
    const tokens = normalizeTokens(result)

    // KC may or may not rotate the refresh token — persist when it did so the
    // next /auth/refresh doesn't replay a stale one.
    if (tokens.refresh_token) {
      try {
        localStorage.setItem('refreshToken', tokens.refresh_token)
      } catch {
        // ignore — non-browser/test contexts
      }
    }

    return tokens
  },

  logoutUrl(idTokenHint) {
    if (!config) {
      throw new Error('Keycloak is not configured')
    }
    const post = `${window.location.origin}/login`
    const base = `${config.url}/realms/${config.realm}/protocol/openid-connect/logout`
    const url = new URL(base)
    url.searchParams.set('post_logout_redirect_uri', post)
    url.searchParams.set('client_id', config.client_id)
    if (idTokenHint) {
      url.searchParams.set('id_token_hint', idTokenHint)
    }
    return url.toString()
  },
}

export default keycloakClient
