"""
Unit tests for the DLP Smart-scan LLM augmentation layer.

Covers (per plan §B1-B4 + Verification > Tests):
  - llm_classify: disabled / short-text / cache / fail-open
  - scan(): privacy gate (skip LLM on regex critical/high)
  - scan(): merge LLM verdict into highest_action (raise-only)
  - _validate_llm_classifier: action_thresholds + guidance_prompt limits

The OpenRouter call is always mocked — these tests are deterministic and
require no network. The module-level `_LLM_CACHE` is cleared at the start
of each test that exercises it.
"""

import json

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# A canonical AWS-docs example secret key — passes the high-entropy filter
# applied by the `aws_secret_key` regex rule (severity=critical).
_AWS_SECRET_FAKE = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY'

# Luhn-valid Visa test number (severity=high).
_CREDIT_CARD = '4111111111111111'


def _llm_response(category: str = 'restricted', reason: str = 'test reason') -> dict:
    """Build a minimal OpenRouter chat-completion response."""
    content = json.dumps({'category': category, 'reason': reason})
    return {'choices': [{'message': {'content': content}}]}


def _make_policy(
    enabled: bool = True,
    llm_enabled: bool = True,
    guidance: str = '',
    thresholds: dict | None = None,
    sensitivity: str = 'balanced',
) -> dict:
    return {
        'enabled': enabled,
        'sensitivity': sensitivity,
        'rule_overrides': {},
        'custom_patterns': [],
        'internal_hostname_suffixes': [],
        'llm_classifier': {
            'enabled': llm_enabled,
            'model': 'google/gemini-3.1-flash-lite',
            'guidance_prompt': guidance,
            'action_thresholds': thresholds or {
                'confidential': 'warn',
                'restricted': 'require_confirm',
            },
        },
    }


@pytest.fixture(autouse=True)
def _clear_llm_cache():
    """Isolate each test from the module-level Smart-scan cache."""
    from app.services import dlp_service
    dlp_service._LLM_CACHE.clear()
    yield
    dlp_service._LLM_CACHE.clear()


# ---------------------------------------------------------------------------
# llm_classify — fast-path / cache / fail-open
# ---------------------------------------------------------------------------

class TestLLMClassify:
    def test_llm_classify_disabled_returns_none(self, monkeypatch):
        """Smart scan disabled → None, never calls OpenRouter."""
        from app.services.dlp_service import DLPDetector

        calls: list = []

        def fake_completion(payload, **kwargs):
            calls.append(payload)
            return _llm_response()

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            fake_completion,
        )

        detector = DLPDetector(_make_policy(llm_enabled=False))
        text = 'a' * 100  # well over the 30-char threshold

        assert detector.llm_classify(text) is None
        assert calls == []

    def test_llm_classify_short_text_skipped(self, monkeypatch):
        """Text under 30 chars must skip the LLM (cost guard)."""
        from app.services.dlp_service import DLPDetector

        calls: list = []

        def fake_completion(payload, **kwargs):
            calls.append(payload)
            return _llm_response()

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            fake_completion,
        )

        detector = DLPDetector(_make_policy(llm_enabled=True))

        # 29 chars → below 30-char threshold
        assert detector.llm_classify('a' * 29) is None
        assert calls == []

    def test_llm_classify_cache_hit(self, monkeypatch):
        """Identical text + guidance + lang re-uses the cached verdict."""
        from app.services.dlp_service import DLPDetector

        calls: list = []

        def fake_completion(payload, **kwargs):
            calls.append(payload)
            return _llm_response('restricted', 'leak hint')

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            fake_completion,
        )

        detector = DLPDetector(_make_policy(llm_enabled=True))
        text = 'a' * 50  # over the 30-char threshold

        v1 = detector.llm_classify(text)
        v2 = detector.llm_classify(text)

        assert v1 == v2 == {'category': 'restricted', 'reason': 'leak hint'}
        assert len(calls) == 1  # second call hit the cache

    def test_llm_classify_invalid_response_fails_open(self, monkeypatch):
        """Malformed JSON / unknown category / network errors all → None.
        Failures must NOT be cached — a third invocation still hits the LLM."""
        from app.services.dlp_service import DLPDetector

        # Three separate text payloads so cache keys differ between cases
        text_a = 'malformed json case ' + 'x' * 30
        text_b = 'unknown category case ' + 'y' * 30
        text_c = 'network error case ' + 'z' * 30

        # --- Variant 1: malformed JSON content ---
        bad_calls: list = []

        def malformed(payload, **kwargs):
            bad_calls.append(payload)
            return {'choices': [{'message': {'content': 'this is not json'}}]}

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            malformed,
        )
        detector = DLPDetector(_make_policy(llm_enabled=True))
        assert detector.llm_classify(text_a) is None

        # --- Variant 2: well-formed JSON but invalid category ---
        def wrong_category(payload, **kwargs):
            bad_calls.append(payload)
            return {'choices': [{'message': {
                'content': json.dumps({'category': 'top-secret', 'reason': 'x'}),
            }}]}

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            wrong_category,
        )
        assert detector.llm_classify(text_b) is None

        # --- Variant 3: network / upstream exception ---
        def boom(payload, **kwargs):
            bad_calls.append(payload)
            raise RuntimeError('connection reset')

        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            boom,
        )
        assert detector.llm_classify(text_c) is None

        # Failures must NOT be cached — call the malformed-text again, mock
        # should fire a SECOND time on the same input.
        from app.services import dlp_service
        before = len(bad_calls)

        # Re-attach the malformed mock so we can re-test text_a deterministically
        monkeypatch.setattr(
            'app.services.openrouter_service.OpenRouterService._sync_completion',
            malformed,
        )
        assert detector.llm_classify(text_a) is None
        assert len(bad_calls) == before + 1
        # And nothing was written to the cache
        assert dlp_service._LLM_CACHE == {}


# ---------------------------------------------------------------------------
# scan() — privacy gate (don't ship secrets to LLM)
# ---------------------------------------------------------------------------

class TestScanPrivacyGate:
    def test_scan_skips_llm_when_regex_critical(self, monkeypatch):
        """An AWS secret (critical) in the text must skip the LLM second pass."""
        from app.services.dlp_service import DLPDetector

        classify_calls: list = []

        def fake_classify(self, text, user_lang='en', *, user_id=None):
            classify_calls.append(text)
            return {'category': 'restricted', 'reason': 'should never run'}

        monkeypatch.setattr(DLPDetector, 'llm_classify', fake_classify)

        detector = DLPDetector(_make_policy(llm_enabled=True))
        # Mention an internal codename + the critical AWS secret
        text = (
            f'My key is {_AWS_SECRET_FAKE} for Project Atlas timeline planning.'
        )
        result = detector.scan(text)

        # Regex caught the critical secret
        assert result.highest_action == 'block'
        rule_ids = {m.rule_id for m in result.matches}
        assert 'aws_secret_key' in rule_ids
        # And the LLM was NEVER invoked
        assert classify_calls == []

    def test_scan_skips_llm_when_regex_high(self, monkeypatch):
        """A credit-card hit (high) must also skip the LLM second pass."""
        from app.services.dlp_service import DLPDetector

        classify_calls: list = []

        def fake_classify(self, text, user_lang='en', *, user_id=None):
            classify_calls.append(text)
            return {'category': 'restricted', 'reason': 'should never run'}

        monkeypatch.setattr(DLPDetector, 'llm_classify', fake_classify)

        detector = DLPDetector(_make_policy(llm_enabled=True))
        text = f'Please charge my card {_CREDIT_CARD} for the order.'
        result = detector.scan(text)

        rule_ids = {m.rule_id for m in result.matches}
        assert 'credit_card' in rule_ids
        # high-severity gate fires → LLM skipped
        assert classify_calls == []


# ---------------------------------------------------------------------------
# scan() — verdict merging (raise-only)
# ---------------------------------------------------------------------------

class TestScanLLMMerge:
    def test_scan_llm_raises_action_above_regex_warn(self, monkeypatch):
        """Email regex hit (warn) + LLM 'restricted' (require_confirm)
        → final highest_action == 'require_confirm', synthetic match present."""
        from app.services.dlp_service import DLPDetector

        def fake_classify(self, text, user_lang='en', *, user_id=None):
            return {'category': 'restricted', 'reason': 'mentions codename'}

        monkeypatch.setattr(DLPDetector, 'llm_classify', fake_classify)

        # 'strict' sensitivity surfaces low-severity email rule (warn).
        detector = DLPDetector(_make_policy(llm_enabled=True, sensitivity='strict'))
        text = 'Email me at user@example.com about Project Atlas updates.'
        result = detector.scan(text)

        rule_ids = [m.rule_id for m in result.matches]
        assert 'email' in rule_ids
        assert 'ai_smart_scan' in rule_ids
        assert result.highest_action == 'require_confirm'

        smart = next(m for m in result.matches if m.rule_id == 'ai_smart_scan')
        assert smart.category == 'restricted'
        assert smart.action == 'require_confirm'
        # reason now lives on description, not snippet
        assert smart.description == 'mentions codename'
        assert smart.snippet == ''
        assert smart.source == 'llm'

    def test_scan_llm_does_not_lower_regex_block(self, monkeypatch):
        """When regex blocks (critical), the privacy gate trips → LLM skipped
        and `block` stays `block`. No synthetic ai_smart_scan match appears."""
        from app.services.dlp_service import DLPDetector

        # Even if the LLM were somehow called, ensure it would return
        # something LOWER than block — so we can confirm block is preserved.
        classify_calls: list = []

        def fake_classify(self, text, user_lang='en', *, user_id=None):
            classify_calls.append(text)
            return {'category': 'confidential', 'reason': 'soft hint'}

        monkeypatch.setattr(DLPDetector, 'llm_classify', fake_classify)

        detector = DLPDetector(_make_policy(llm_enabled=True))
        text = f'Critical leak {_AWS_SECRET_FAKE} happens here.'
        result = detector.scan(text)

        # block from regex preserved
        assert result.highest_action == 'block'
        # privacy gate suppressed the LLM call entirely
        assert classify_calls == []
        # and no synthetic Smart-scan finding was injected
        rule_ids = {m.rule_id for m in result.matches}
        assert 'ai_smart_scan' not in rule_ids


# ---------------------------------------------------------------------------
# Policy validation — _validate_llm_classifier
# ---------------------------------------------------------------------------

class TestValidateLLMClassifier:
    def test_validate_llm_classifier_rejects_block_for_confidential(self):
        """`confidential` must never escalate to block; max is require_confirm."""
        from app.routes.dlp import _build_policy_payload

        body = {
            'llm_classifier': {
                'action_thresholds': {'confidential': 'block'},
            },
        }
        payload, err = _build_policy_payload(body)

        assert payload is None
        assert err is not None
        assert 'confidential' in err

    def test_validate_llm_classifier_accepts_block_for_restricted(self):
        """`restricted` may escalate to block — payload returns clean."""
        from app.routes.dlp import _build_policy_payload

        body = {
            'llm_classifier': {
                'action_thresholds': {'restricted': 'block'},
            },
        }
        payload, err = _build_policy_payload(body)

        assert err is None
        assert payload is not None
        assert payload['llm_classifier']['action_thresholds']['restricted'] == 'block'

    def test_validate_llm_classifier_rejects_oversized_prompt(self):
        """guidance_prompt > 4000 chars must be rejected."""
        from app.routes.dlp import _build_policy_payload

        body = {
            'llm_classifier': {
                'guidance_prompt': 'x' * 4001,
            },
        }
        payload, err = _build_policy_payload(body)

        assert payload is None
        assert err is not None
        assert '4000' in err
