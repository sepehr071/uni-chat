"""
DLP detector service.

Usage:
    policy = effective_policy(workspace.get('settings', {}).get('dlp'))
    detector = DLPDetector(policy)
    result = detector.scan(user_text)

Or, fetching from DB:
    detector = DLPDetector.from_workspace(workspace_id_str)
    result = detector.scan(user_text)
"""
import hashlib
import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from app.services.dlp_rules import BUILTIN_RULES

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Action / severity ranking helpers
# ---------------------------------------------------------------------------

ACTION_RANK: dict[str, int] = {
    "allow": 0,
    "warn": 1,
    "require_confirm": 2,
    "block": 3,
}

SEVERITY_RANK: dict[str, int] = {
    "low": 0,
    "medium": 1,
    "high": 2,
    "critical": 3,
}

# Effective minimum severity rank per sensitivity
_SENSITIVITY_MIN_RANK: dict[str, int] = {
    "lenient": SEVERITY_RANK["high"],
    "balanced": SEVERITY_RANK["medium"],
    "strict": SEVERITY_RANK["low"],
}


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class DLPMatch:
    rule_id: str
    rule_name: str
    severity: str
    action: str
    snippet: str          # ±20 chars context with match replaced by '*'
    offset_start: int
    offset_end: int
    category: Optional[str] = None
    description: Optional[str] = None
    # 'builtin' | 'custom' | 'hostname' | 'llm'
    source: str = 'builtin'


@dataclass
class DLPScanResult:
    matches: list[DLPMatch] = field(default_factory=list)
    highest_action: str = "allow"
    text_sha256: str = ""
    text_length: int = 0

    def to_dict(self) -> dict:
        out_matches: list[dict] = []
        for m in self.matches:
            entry: dict = {
                "rule_id": m.rule_id,
                "rule_name": m.rule_name,
                "severity": m.severity,
                "action": m.action,
                "snippet": m.snippet,
                "offset_start": m.offset_start,
                "offset_end": m.offset_end,
                "source": m.source,
            }
            if m.category is not None:
                entry["category"] = m.category
            if m.description is not None:
                entry["description"] = m.description
            out_matches.append(entry)
        return {
            "matches": out_matches,
            "highest_action": self.highest_action,
            "text_sha256": self.text_sha256,
            "text_length": self.text_length,
        }


# ---------------------------------------------------------------------------
# Policy resolver
# ---------------------------------------------------------------------------

_POLICY_DEFAULTS: dict[str, Any] = {
    "enabled": False,
    "sensitivity": "balanced",
    "rule_overrides": {},
    "custom_patterns": [],
    "internal_hostname_suffixes": [],
    "llm_classifier": {
        "enabled": False,
        "model": "google/gemini-3.1-flash-lite",
        "guidance_prompt": "",
        "action_thresholds": {
            "confidential": "warn",
            "restricted": "require_confirm",
        },
    },
    "notify_owners": True,
}


def effective_policy(raw_dlp: Optional[dict]) -> dict:
    """
    Merge workspace DLP settings with defaults.

    Args:
        raw_dlp: The value of workspaces.settings.dlp (may be None or partial).

    Returns:
        Fully populated policy dict.
    """
    if raw_dlp is None:
        raw_dlp = {}

    merged: dict[str, Any] = dict(_POLICY_DEFAULTS)

    for key in _POLICY_DEFAULTS:
        if key in raw_dlp:
            raw_val = raw_dlp[key]
            # Deep-merge llm_classifier sub-dict
            if key == "llm_classifier" and isinstance(raw_val, dict):
                merged[key] = {**_POLICY_DEFAULTS[key], **raw_val}
            else:
                merged[key] = raw_val

    return merged


# ---------------------------------------------------------------------------
# Language resolution for smart-scan reason output
# ---------------------------------------------------------------------------

# Common 2-char prefixes the chokepoints emit (truncated from
# user.ai_preferences.user_info.language). Maps to full English language names
# the model can recognize. Unknown values fall back to English.
_LANG_NAMES: dict[str, str] = {
    'en': 'English',
    'fa': 'Persian',
    'pe': 'Persian',
    'ar': 'Arabic',
    'de': 'German',
    'ge': 'German',
    'fr': 'French',
    'es': 'Spanish',
    'sp': 'Spanish',
    'it': 'Italian',
    'pt': 'Portuguese',
    'po': 'Portuguese',
    'ru': 'Russian',
    'tr': 'Turkish',
    'tu': 'Turkish',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ch': 'Chinese',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'sv': 'Swedish',
    'pl': 'Polish',
}


def _resolve_lang_name(user_lang: str) -> str:
    code = (user_lang or '').strip().lower()[:2]
    return _LANG_NAMES.get(code, 'English')


# ---------------------------------------------------------------------------
# Smart-scan LLM verdict cache (module-level, in-memory)
# ---------------------------------------------------------------------------

# sha256 -> (verdict_dict, expires_at_epoch)
_LLM_CACHE: dict[str, tuple[dict, float]] = {}
_LLM_CACHE_TTL = 24 * 3600  # 24 hours
_LLM_CACHE_MAX = 2000


def _llm_cache_get(key: str) -> Optional[dict]:
    """Return cached verdict if present and not expired, else None."""
    entry = _LLM_CACHE.get(key)
    if entry is None:
        return None
    verdict, expires_at = entry
    if time.time() > expires_at:
        _LLM_CACHE.pop(key, None)
        return None
    return verdict


def _llm_cache_set(key: str, verdict: dict) -> None:
    """Insert a verdict into the cache, evicting the oldest entry when full."""
    if len(_LLM_CACHE) >= _LLM_CACHE_MAX:
        # Evict the entry with the earliest expires_at (effectively oldest insert)
        oldest_key = min(_LLM_CACHE.keys(), key=lambda k: _LLM_CACHE[k][1])
        _LLM_CACHE.pop(oldest_key, None)
    _LLM_CACHE[key] = (verdict, time.time() + _LLM_CACHE_TTL)


# ---------------------------------------------------------------------------
# DLP Detector
# ---------------------------------------------------------------------------

class DLPDetector:
    """
    Scans text against the effective workspace DLP policy.

    The caller is responsible for resolving the workspace policy via
    effective_policy() and passing the result to __init__.
    """

    def __init__(self, policy: dict) -> None:
        self._policy = policy
        self.enabled: bool = bool(policy.get("enabled", False))
        self._sensitivity: str = policy.get("sensitivity", "balanced")
        self._min_severity_rank: int = _SENSITIVITY_MIN_RANK.get(
            self._sensitivity, SEVERITY_RANK["medium"]
        )
        self._rule_overrides: dict[str, str] = policy.get("rule_overrides", {}) or {}
        self._custom_patterns: list[dict] = policy.get("custom_patterns", []) or []
        self._hostname_suffixes: list[str] = policy.get(
            "internal_hostname_suffixes", []
        ) or []

        # Compiled custom pattern cache: {regex_str: compiled | None (bad regex)}
        self._custom_compiled: dict[str, Optional[re.Pattern]] = {}

    # ------------------------------------------------------------------
    # Class method factory
    # ------------------------------------------------------------------

    @classmethod
    def from_workspace(cls, workspace_id: str) -> "DLPDetector":
        """
        Load workspace from DB and return a configured DLPDetector.
        If workspace not found or DLP not enabled, returns a no-op detector.
        """
        from app.models.workspace import WorkspaceModel

        workspace = WorkspaceModel.find_by_id(workspace_id)
        if workspace is None:
            logger.warning("DLPDetector.from_workspace: workspace %s not found", workspace_id)
            return cls({"enabled": False})

        raw_dlp = (workspace.get("settings") or {}).get("dlp")
        policy = effective_policy(raw_dlp)
        return cls(policy)

    # ------------------------------------------------------------------
    # Snippet helper
    # ------------------------------------------------------------------

    @staticmethod
    def _make_snippet(text: str, start: int, end: int) -> str:
        """
        Return ±20 chars around the match with the match itself masked by '*'.
        Newlines in the surrounding context are replaced by space to keep
        the snippet single-line.
        """
        match_len = end - start
        masked_match = '*' * match_len

        before = text[max(0, start - 20):start].replace('\n', ' ')
        after = text[end:end + 20].replace('\n', ' ')

        return before + masked_match + after

    # ------------------------------------------------------------------
    # Overlap deduplication
    # ------------------------------------------------------------------

    @staticmethod
    def _dedup_overlapping(matches: list[DLPMatch]) -> list[DLPMatch]:
        """
        When two matches overlap in the text, keep the one with the highest
        severity (ties broken by earlier offset_start).
        """
        if not matches:
            return matches

        # Sort by start offset, then by severity desc
        sorted_matches = sorted(
            matches,
            key=lambda m: (m.offset_start, -SEVERITY_RANK.get(m.severity, 0))
        )

        kept: list[DLPMatch] = []
        for candidate in sorted_matches:
            overlap = False
            for kept_match in kept:
                # Check overlap
                if (candidate.offset_start < kept_match.offset_end and
                        candidate.offset_end > kept_match.offset_start):
                    # There's an overlap — keep the higher severity
                    cand_rank = SEVERITY_RANK.get(candidate.severity, 0)
                    kept_rank = SEVERITY_RANK.get(kept_match.severity, 0)
                    if cand_rank > kept_rank:
                        # Replace kept with candidate
                        kept.remove(kept_match)
                        kept.append(candidate)
                    overlap = True
                    break
            if not overlap:
                kept.append(candidate)

        return kept

    # ------------------------------------------------------------------
    # Core scan
    # ------------------------------------------------------------------

    def scan(self, text: str, user_lang: str = 'en') -> DLPScanResult:
        """
        Scan text against all active rules. Returns a DLPScanResult.
        Does not persist events — caller is responsible for that.

        Args:
            text: The user-supplied text to scan.
            user_lang: 'en' or 'fa' — controls the language of LLM-generated
                Smart-scan reasons. Forwarded to ``llm_classify``.
        """
        result = DLPScanResult()

        if not text:
            return result

        result.text_length = len(text)
        result.text_sha256 = hashlib.sha256(text.encode("utf-8")).hexdigest()

        if not self.enabled:
            return result

        all_matches: list[DLPMatch] = []

        # --- Builtin rules ---
        for rule in BUILTIN_RULES:
            rule_id: str = rule["id"]
            severity: str = rule["severity"]

            # Sensitivity filter
            if SEVERITY_RANK.get(severity, 0) < self._min_severity_rank:
                continue

            # Override to allow → skip entirely
            override_action = self._rule_overrides.get(rule_id)
            if override_action == "allow":
                continue

            # Determine effective action
            action = override_action if override_action else rule["default_action"]

            pattern: re.Pattern = rule["regex"]
            validator: Optional[Callable[[str], bool]] = rule.get("validate")

            for m in pattern.finditer(text):
                matched_text = m.group(0)

                # Optional length filter
                min_len = rule.get("min_len", 0)
                if len(matched_text) < min_len:
                    continue

                # Optional validator (Luhn, IBAN mod-97, etc.)
                if validator is not None and not validator(matched_text):
                    continue

                snippet = self._make_snippet(text, m.start(), m.end())
                all_matches.append(DLPMatch(
                    rule_id=rule_id,
                    rule_name=rule["name"],
                    severity=severity,
                    action=action,
                    snippet=snippet,
                    offset_start=m.start(),
                    offset_end=m.end(),
                    category=rule.get("category"),
                    description=rule.get("description"),
                    source='builtin',
                ))

        # --- Custom patterns from policy ---
        for custom in self._custom_patterns:
            regex_str = custom.get("regex", "")
            if not regex_str:
                continue

            if regex_str not in self._custom_compiled:
                try:
                    self._custom_compiled[regex_str] = re.compile(regex_str)
                except re.error as exc:
                    logger.warning(
                        "DLPDetector: invalid custom regex %r skipped: %s",
                        regex_str, exc
                    )
                    self._custom_compiled[regex_str] = None

            compiled = self._custom_compiled.get(regex_str)
            if compiled is None:
                continue

            custom_severity = custom.get("severity", "medium")
            custom_action = custom.get("action", "warn")
            custom_name = custom.get("name", f"Custom: {regex_str[:30]}")
            custom_id = custom.get("id", f"custom:{regex_str[:20]}")

            # Sensitivity filter for custom rules too
            if SEVERITY_RANK.get(custom_severity, 0) < self._min_severity_rank:
                continue

            for m in compiled.finditer(text):
                snippet = self._make_snippet(text, m.start(), m.end())
                all_matches.append(DLPMatch(
                    rule_id=custom_id,
                    rule_name=custom_name,
                    severity=custom_severity,
                    action=custom_action,
                    snippet=snippet,
                    offset_start=m.start(),
                    offset_end=m.end(),
                    source='custom',
                ))

        # --- Dynamic internal_hostname rule ---
        if self._hostname_suffixes:
            # Escape suffixes and build alternation
            escaped = [re.escape(suffix) for suffix in self._hostname_suffixes]
            hostname_pattern = re.compile(
                r'\b[\w.-]+(?:' + '|'.join(escaped) + r')\b',
                re.IGNORECASE,
            )
            for m in hostname_pattern.finditer(text):
                # Sensitivity: medium
                if SEVERITY_RANK["medium"] < self._min_severity_rank:
                    continue
                override_action = self._rule_overrides.get("internal_hostname")
                if override_action == "allow":
                    continue
                action = override_action if override_action else "warn"
                snippet = self._make_snippet(text, m.start(), m.end())
                all_matches.append(DLPMatch(
                    rule_id="internal_hostname",
                    rule_name="Internal Hostname",
                    severity="medium",
                    action=action,
                    snippet=snippet,
                    offset_start=m.start(),
                    offset_end=m.end(),
                    category='network',
                    description='Internal company hostname',
                    source='hostname',
                ))

        # --- Dedup overlapping matches ---
        deduplicated = self._dedup_overlapping(all_matches)

        result.matches = deduplicated

        # --- Compute highest_action ---
        if deduplicated:
            highest_rank = max(
                ACTION_RANK.get(m.action, 0) for m in deduplicated
            )
            for action_str, rank in ACTION_RANK.items():
                if rank == highest_rank:
                    result.highest_action = action_str
                    break

        # --- Smart scan augmentation (LLM second pass) ---
        # Privacy gate: never ship critical/high regex matches to an external LLM.
        has_high_severity = any(
            SEVERITY_RANK.get(m.severity, 0) >= SEVERITY_RANK['high']
            for m in result.matches
        )

        if not has_high_severity:
            verdict = self.llm_classify(text, user_lang=user_lang)
            if verdict is not None and verdict.get('category') != 'public':
                thresholds = (self._policy.get('llm_classifier') or {}).get(
                    'action_thresholds') or {}
                category = verdict['category']
                default_action = 'warn' if category == 'confidential' else 'require_confirm'
                llm_action = thresholds.get(category, default_action)

                synthetic = DLPMatch(
                    rule_id='ai_smart_scan',
                    rule_name='Smart scan',
                    severity='medium' if category == 'confidential' else 'high',
                    action=llm_action,
                    snippet='',
                    offset_start=0,
                    offset_end=0,
                    category=category,
                    description=verdict.get('reason', ''),
                    source='llm',
                )
                result.matches.append(synthetic)

                # Raise highest_action only — never lower.
                current_rank = ACTION_RANK.get(result.highest_action, 0)
                llm_rank = ACTION_RANK.get(llm_action, 0)
                if llm_rank > current_rank:
                    for action_str, rank in ACTION_RANK.items():
                        if rank == llm_rank:
                            result.highest_action = action_str
                            break

        return result

    # ------------------------------------------------------------------
    # LLM classifier stub
    # ------------------------------------------------------------------

    def llm_classify(self, text: str, user_lang: str = 'en') -> Optional[dict]:
        """
        Smart-scan LLM second-pass classifier.

        Returns ``{"category": "public" | "confidential" | "restricted",
        "reason": str}`` on success, or ``None`` when disabled, skipped
        (text too short), the LLM call fails, the response is malformed,
        or the category is unrecognized. Never raises to the caller —
        Smart scan is fail-open.

        Args:
            text: The user-supplied text. Truncated to 2000 chars before
                being sent upstream to bound cost.
            user_lang: ``'en'`` or ``'fa'`` — instructs the model to phrase
                ``reason`` in the user's UI language.
        """
        lc = self._policy.get('llm_classifier') or {}
        if not lc.get('enabled', False):
            return None
        if len(text) < 30:  # cost guard — short prompts rarely leak
            return None

        guidance = (lc.get('guidance_prompt') or '').strip()
        model = lc.get('model') or 'google/gemini-3.1-flash-lite'

        # Cache key includes model + lang + guidance + text so any change
        # invalidates prior verdicts.
        cache_key = hashlib.sha256(
            f"{model}|{user_lang}|{guidance}|{text}".encode('utf-8')
        ).hexdigest()
        cached = _llm_cache_get(cache_key)
        if cached is not None:
            return cached

        # Resolve UI language to a full English name the model can ground its
        # response language on. `user_lang` arrives as a 2-char prefix from the
        # chokepoints (chat_stream/arena_stream/workflow), e.g. 'en', 'pe',
        # 'ge'. Fall back to English when unknown.
        lang_name = _resolve_lang_name(user_lang)
        base_prompt = (
            "You are a content-safety classifier reviewing a user's message before it is sent to an AI assistant.\n"
            "\n"
            "Decide the category:\n"
            "- public: nothing sensitive — generic questions, public knowledge, code without secrets.\n"
            "- confidential: personal contact info (email, phone), internal hostnames, employee names, low-risk PII.\n"
            "- restricted: API keys, passwords, private keys, customer/account data, financial account numbers, "
            "unreleased product names, internal codenames, anything that would clearly violate compliance.\n"
            "\n"
            "Then write a SHORT, SPECIFIC, USER-FRIENDLY reason (≤30 words) that:\n"
            "- names the type of sensitive data you saw (e.g. \"email address\", \"credit-card number\", \"Stripe API key\"),\n"
            "- explains briefly why sharing it is risky,\n"
            "- uses a calm, second-person tone (\"Your message contains…\"),\n"
            "- never quotes the actual sensitive value verbatim,\n"
            "- never mentions \"AI classifier\", \"flagged\", \"the model\", or other meta language.\n"
            "\n"
            f"Write the reason in {lang_name}.\n"
            "\n"
            'Output ONLY a single JSON object: {"category": "...", "reason": "..."}. '
            "No markdown, no prose, no code fences — JSON only."
        )
        if guidance:
            system = f"{base_prompt}\n\nWorkspace-specific guidance:\n{guidance}"
        else:
            system = (
                f"{base_prompt}\n\nWorkspace-specific guidance:\n"
                "Treat as restricted: API keys, passwords, private keys, customer names, "
                "internal codenames, unreleased product names, financial account numbers. "
                "Treat as confidential: emails, phone numbers, internal hostnames, employee names. "
                "Everything else is public."
            )

        payload = {
            'model': model,
            'messages': [
                {'role': 'system', 'content': system},
                {'role': 'user', 'content': text[:2000]},
            ],
            'temperature': 0.1,
            'max_tokens': 220,
            'reasoning': {'effort': 'minimal'},
        }

        # Lazy import — avoids any chance of circular import at module load.
        from app.services.openrouter_service import OpenRouterService

        try:
            resp = OpenRouterService._sync_completion(
                payload,
                user_id=None,
                conversation_id=None,
                feature='content_safety',
                workspace_id=None,
                project_id=None,
                origin='dlp',
                timeout=3,
            )
        except Exception as exc:
            logger.warning("Smart scan LLM call failed: %s", exc)
            return None

        if not isinstance(resp, dict) or 'error' in resp:
            err = resp.get('error') if isinstance(resp, dict) else resp
            logger.warning("Smart scan LLM error: %s", err)
            return None

        try:
            content = resp['choices'][0]['message']['content']
            parsed = json.loads(content.strip())
            category = parsed.get('category')
            if category not in ('public', 'confidential', 'restricted'):
                logger.warning("Smart scan invalid category: %r", category)
                return None
            verdict = {
                'category': category,
                'reason': str(parsed.get('reason', ''))[:400],
            }
        except (KeyError, IndexError, TypeError, json.JSONDecodeError, AttributeError) as exc:
            logger.warning("Smart scan parse error: %s", exc)
            return None

        _llm_cache_set(cache_key, verdict)
        return verdict
