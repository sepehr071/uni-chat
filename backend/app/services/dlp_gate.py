"""
DLP gate — shared helper invoked at every server-side chokepoint.

Resolves the workspace policy, runs DLPDetector.scan, persists a DLPEventModel
row when matches found, and raises DLPBlockedError when the caller did not pass
explicit dlp_confirmed=True for require_confirm policy (block always raises,
regardless of confirm).
"""
from dataclasses import asdict
from typing import Any, Optional

from app.models.dlp_event import DLPEventModel
from app.services.dlp_service import DLPDetector


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
    user_lang: str = 'en',
) -> Optional[dict[str, Any]]:
    """
    Run DLP scan against text and persist an event when matches found.

    Returns the persisted dlp_event dict, or None when no scan needed (no
    workspace, empty text, or no matches).

    Raises DLPBlockedError when:
      - highest_action == 'block' (always — non-overridable)
      - highest_action == 'require_confirm' and confirmed is False
    """
    if not text or not workspace_id:
        return None

    detector = DLPDetector.from_workspace(str(workspace_id))
    result = detector.scan(text, user_lang=user_lang)
    if not result.matches:
        return None

    action = result.highest_action
    matches_dicts = [asdict(m) for m in result.matches]

    code: Optional[str] = None
    was_sent = True
    if action == "block":
        was_sent = False
        code = "dlp_blocked"
    elif action == "require_confirm":
        if confirmed:
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
