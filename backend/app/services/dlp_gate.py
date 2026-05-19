"""
DLP gate — shared helper invoked at every server-side chokepoint.

Resolves the workspace policy, runs DLPDetector.scan, persists a DLPEventModel
row when matches found, and raises DLPBlockedError when the caller did not pass
explicit dlp_confirmed=True for require_confirm policy (block always raises,
regardless of confirm).

P0 hardening (this revision): `dlp_confirmed=True` is no longer trusted by
itself. The caller must additionally pass `dlp_confirm_token` minted by
``/api/dlp/scan`` for the SAME text+user+workspace, with a 5-minute expiry,
HMAC-signed under ``JWT_SECRET_KEY``. Without a valid token we DENY (treat as
unconfirmed) and emit a warning so operators can spot bypass attempts. The
``block`` posture is unaffected — still non-overridable.
"""
import logging
from dataclasses import asdict
from typing import Any, Optional

from app.models.dlp_event import DLPEventModel
from app.services.dlp_service import DLPDetector

logger = logging.getLogger(__name__)


class DLPBlockedError(Exception):
    """Raised when DLP scan returns block / require_confirm without confirmation."""

    def __init__(self, code: str, matches: list[dict[str, Any]], message: str = "") -> None:
        super().__init__(message or code)
        self.code = code  # 'dlp_blocked' | 'dlp_confirm_required'
        self.matches = matches  # list of serialized DLPMatch dicts


def gate(
    *,
    text: str,
    user_id: Any,
    workspace_id: Any,
    project_id: Any = None,
    source: str,
    source_ref: dict[str, Any],
    confirmed: bool = False,
    dlp_confirm_token: Optional[str] = None,
    user_lang: str = 'en',
) -> Optional[dict[str, Any]]:
    """
    Run DLP scan against text and persist an event when matches found.

    Returns the persisted dlp_event dict, or None when no scan needed (no
    workspace, empty text, or no matches).

    Raises DLPBlockedError when:
      - highest_action == 'block' (always — non-overridable)
      - highest_action == 'require_confirm' and (``confirmed`` is False OR
        ``dlp_confirm_token`` fails HMAC/expiry/payload verification)
    """
    if not text or not workspace_id:
        return None

    detector = DLPDetector.from_workspace(str(workspace_id))
    result = detector.scan(text, user_lang=user_lang, user_id=user_id)
    if not result.matches:
        return None

    action = result.highest_action
    matches_dicts = [asdict(m) for m in result.matches]

    # `require_confirm` posture requires BOTH confirmed=True AND a valid
    # HMAC-signed token bound to (text_sha256, user, workspace). Without a
    # token we fall back to DENY — clients MUST go through `/dlp/scan` first.
    confirmed_effective = bool(confirmed)
    if action == "require_confirm" and confirmed_effective:
        from app.routes.dlp import _verify_dlp_token  # local import — avoid cycle at module load
        token_ok = _verify_dlp_token(
            dlp_confirm_token or '',
            text_sha256=result.text_sha256,
            user_id=str(user_id) if user_id is not None else '',
            workspace_id=str(workspace_id) if workspace_id else None,
        )
        if not token_ok:
            logger.warning(
                "DLP gate: dlp_confirmed=True with missing/invalid confirm_token "
                "for source=%s user=%s workspace=%s — denying (treating as unconfirmed)",
                source, user_id, workspace_id,
            )
            confirmed_effective = False

    code: Optional[str] = None
    was_sent = True
    if action == "block":
        was_sent = False
        code = "dlp_blocked"
    elif action == "require_confirm":
        if confirmed_effective:
            was_sent = True
        else:
            was_sent = False
            code = "dlp_confirm_required"

    event = DLPEventModel.create(
        user_id=user_id,
        workspace_id=workspace_id,
        project_id=project_id,
        source=source,
        source_ref=source_ref,
        matches=matches_dicts,
        highest_action=action,
        was_sent=was_sent,
        text_sha256=result.text_sha256,
        text_length=result.text_length,
    )

    if code is not None:
        raise DLPBlockedError(code=code, matches=matches_dicts)

    return event


def format_blocked_response(err: DLPBlockedError) -> dict[str, Any]:
    """Shape the JSON body returned to clients on DLP block / confirm-required."""
    return {
        "error": "Sensitive content blocked by Content Safety policy"
        if err.code == "dlp_blocked"
        else "Content Safety confirmation required",
        "code": err.code,
        "matches": [
            {
                "rule_id": m["rule_id"],
                "rule_name": m["rule_name"],
                "severity": m["severity"],
                "action": m["action"],
                "offset_start": m["offset_start"],
                "offset_end": m["offset_end"],
                "snippet": m["snippet"],
            }
            for m in err.matches
        ],
    }
