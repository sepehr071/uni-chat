"""
Tests for SMM workflow extensions (Phase B1 + B2):
  - B1: Brand-brief inject from knowledge folder into aiAgent system prompt
  - B2: Multi-variant text generation with concurrent LLM calls
"""

import pytest
from unittest.mock import patch, MagicMock


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_ai_agent_node(node_id='node-1', **data_overrides):
    data = {
        'system_prompt': 'You are a copywriter.',
        'user_prompt_template': 'Write a post about {{input}}',
        'model': 'google/gemini-3-flash-preview',
        'temperature': 0.7,
        'max_tokens': 512,
    }
    data.update(data_overrides)
    return {'id': node_id, 'type': 'aiAgent', 'data': data}


def _chat_response(content: str) -> dict:
    """Minimal OpenRouter chat_completion response."""
    return {
        'choices': [{'message': {'content': content}}]
    }


# ---------------------------------------------------------------------------
# B2 — single variant (backward compat)
# ---------------------------------------------------------------------------

class TestAiAgentNoVariants:
    def test_no_variants_key_returns_text_only(self, app):
        """Node without 'variants' key must return {text, node_id, generation_time_ms} only."""
        node = _make_ai_agent_node()

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch('app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt', return_value='sys'):
                    with patch('app.services.workflow_service.OpenRouterService.chat_completion',
                               return_value=_chat_response('hello world')):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, ['social media'], 'user123')

        assert result['text'] == 'hello world'
        assert 'text_variants' not in result
        assert result['node_id'] == 'node-1'
        assert 'generation_time_ms' in result

    def test_variants_1_returns_text_only(self, app):
        """Explicit variants=1 must NOT produce text_variants key."""
        node = _make_ai_agent_node(variants=1)

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch('app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt', return_value='sys'):
                    with patch('app.services.workflow_service.OpenRouterService.chat_completion',
                               return_value=_chat_response('only one')):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, [], 'user123')

        assert result['text'] == 'only one'
        assert 'text_variants' not in result


# ---------------------------------------------------------------------------
# B2 — multi-variant
# ---------------------------------------------------------------------------

class TestAiAgentVariants:
    def test_variants_3_returns_text_variants_list(self, app):
        """variants=3 returns text_variants of length 3; text == text_variants[0]."""
        node = _make_ai_agent_node(variants=3)

        call_count = {'n': 0}
        def _fake_completion(**kwargs):
            idx = call_count['n']
            call_count['n'] += 1
            return _chat_response(f'variant-{idx}')

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch('app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt', return_value='sys'):
                    with patch('app.services.workflow_service.OpenRouterService.chat_completion',
                               side_effect=_fake_completion):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, ['topic'], 'user123')

        assert 'text_variants' in result
        assert len(result['text_variants']) == 3
        # text must equal first non-empty variant (backward compat)
        assert result['text'] == result['text_variants'][0]
        # All variants should be non-empty
        assert all(v for v in result['text_variants'])

    def test_variants_clamped_to_10(self, app):
        """variants > 10 is clamped to 10."""
        node = _make_ai_agent_node(variants=99)

        responses = iter([_chat_response(f'v{i}') for i in range(10)])

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch('app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt', return_value='sys'):
                    with patch('app.services.workflow_service.OpenRouterService.chat_completion',
                               side_effect=lambda **kw: next(responses)):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, [], 'user123')

        assert len(result['text_variants']) == 10

    def test_partial_failure_keeps_successes(self, app):
        """If some variant calls fail but not all, result uses the successes."""
        node = _make_ai_agent_node(variants=3)

        call_count = {'n': 0}
        def _flaky(**kwargs):
            idx = call_count['n']
            call_count['n'] += 1
            if idx == 1:
                raise RuntimeError("simulated LLM error")
            return _chat_response(f'ok-{idx}')

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch('app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt', return_value='sys'):
                    with patch('app.services.workflow_service.OpenRouterService.chat_completion',
                               side_effect=_flaky):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, [], 'user123')

        # Should succeed with 2 variants; failed slot is empty string
        assert result['text'] != ''
        non_empty = [v for v in result['text_variants'] if v]
        assert len(non_empty) == 2


# ---------------------------------------------------------------------------
# B1 — Knowledge brief inject
# ---------------------------------------------------------------------------

class TestAiAgentKnowledgeBriefInject:
    def test_brief_injected_into_system_prompt(self, app):
        """When knowledge_folder_id is set, item content appears inside <BRAND_BRIEF>."""
        from bson import ObjectId
        user_oid = ObjectId()
        folder_oid = ObjectId()
        node = _make_ai_agent_node(
            knowledge_folder_id=str(folder_oid),
            system_prompt='Original system prompt.',
        )
        fake_folder = {'_id': folder_oid, 'user_id': user_oid, 'name': 'Brand Kit', 'project_id': None}

        fake_items = [
            {'title': 'Brand Voice', 'content': 'We are friendly and energetic.'},
        ]

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch(
                    'app.services.workflow_service.KnowledgeItemModel.find_by_user',
                    return_value=(fake_items, 1),
                ):
                    with patch(
                        'app.models.knowledge_folder.KnowledgeFolderModel.find_by_id',
                        return_value=fake_folder,
                    ):
                        captured = {}
                        def _capture_system(**kwargs):
                            captured['system_prompt'] = kwargs.get('system_prompt', '')
                            return _chat_response('great post')

                        with patch(
                            'app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt',
                            side_effect=lambda base, prefs: base,
                        ):
                            with patch(
                                'app.services.workflow_service.OpenRouterService.chat_completion',
                                side_effect=_capture_system,
                            ):
                                from app.services.workflow_service import WorkflowService
                                result = WorkflowService.execute_node(node, [], str(user_oid))

        sys_used = captured.get('system_prompt', '')
        assert '<BRAND_BRIEF>' in sys_used
        assert 'We are friendly and energetic.' in sys_used
        assert '</BRAND_BRIEF>' in sys_used
        # Original system prompt still present
        assert 'Original system prompt.' in sys_used
        assert result['text'] == 'great post'

    def test_brief_absent_when_no_folder(self, app):
        """Without knowledge_folder_id, no <BRAND_BRIEF> block is injected."""
        node = _make_ai_agent_node(system_prompt='Plain system.')

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                captured = {}
                def _capture_system(**kwargs):
                    captured['system_prompt'] = kwargs.get('system_prompt', '')
                    return _chat_response('ok')

                with patch(
                    'app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt',
                    side_effect=lambda base, prefs: base,
                ):
                    with patch(
                        'app.services.workflow_service.OpenRouterService.chat_completion',
                        side_effect=_capture_system,
                    ):
                        from app.services.workflow_service import WorkflowService
                        result = WorkflowService.execute_node(node, [], 'user123')

        assert '<BRAND_BRIEF>' not in captured.get('system_prompt', '')

    def test_brief_truncated_at_limit(self, app):
        """Brief exceeding 8000 chars gets truncated with notice appended."""
        from bson import ObjectId
        user_oid = ObjectId()
        folder_oid = ObjectId()
        node = _make_ai_agent_node(knowledge_folder_id=str(folder_oid))
        fake_folder = {'_id': folder_oid, 'user_id': user_oid, 'name': 'Docs', 'project_id': None}

        long_body = 'x' * 9000
        fake_items = [{'title': 'Long doc', 'content': long_body}]

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch(
                    'app.services.workflow_service.KnowledgeItemModel.find_by_user',
                    return_value=(fake_items, 1),
                ):
                    with patch(
                        'app.models.knowledge_folder.KnowledgeFolderModel.find_by_id',
                        return_value=fake_folder,
                    ):
                        captured = {}
                        def _capture(**kwargs):
                            captured['system_prompt'] = kwargs.get('system_prompt', '')
                            return _chat_response('ok')

                        with patch(
                            'app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt',
                            side_effect=lambda base, prefs: base,
                        ):
                            with patch(
                                'app.services.workflow_service.OpenRouterService.chat_completion',
                                side_effect=_capture,
                            ):
                                from app.services.workflow_service import WorkflowService
                                WorkflowService.execute_node(node, [], str(user_oid))

        sys_used = captured.get('system_prompt', '')
        assert '[brand brief truncated]' in sys_used
        # The total content within BRAND_BRIEF tags shouldn't be wildly over limit
        start = sys_used.index('<BRAND_BRIEF>') + len('<BRAND_BRIEF>\n')
        end = sys_used.index('</BRAND_BRIEF>')
        brief_content = sys_used[start:end]
        assert len(brief_content) <= 8000 + 50  # small allowance for the truncation notice line

    def test_folder_error_skips_inject_does_not_fail(self, app):
        """If KnowledgeItemModel raises, the node should still succeed (graceful skip)."""
        node = _make_ai_agent_node(knowledge_folder_id='bad-folder')

        with app.app_context():
            with patch('app.services.workflow_service.UserModel.find_by_id', return_value={'ai_preferences': {}}):
                with patch(
                    'app.services.workflow_service.KnowledgeItemModel.find_by_user',
                    side_effect=Exception("DB error"),
                ):
                    with patch(
                        'app.services.workflow_service.OpenRouterService.build_enhanced_system_prompt',
                        side_effect=lambda base, prefs: base,
                    ):
                        with patch(
                            'app.services.workflow_service.OpenRouterService.chat_completion',
                            return_value=_chat_response('fallback'),
                        ):
                            from app.services.workflow_service import WorkflowService
                            result = WorkflowService.execute_node(node, [], 'user123')

        assert result['text'] == 'fallback'
