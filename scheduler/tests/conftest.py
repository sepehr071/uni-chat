"""Shared pytest fixtures.

Tests stub out the heavy backend / network dependencies so the scheduler can
be tested in isolation. Specifically:

* `scheduler.flask_ctx.flask_app` — replaced with a no-op context manager
  so we never need a running Flask app, Mongo, or OpenRouter.
* Backend model classes used by scheduler are replaced with `MagicMock`s
  in the relevant `app.*` import paths.
"""
import contextlib
import os
import sys
import types
from unittest.mock import MagicMock

# Provide required env vars BEFORE scheduler.settings is imported by anything.
os.environ.setdefault('MONGO_URI', 'mongodb://localhost:27017/unichat_test')
os.environ.setdefault('OPENROUTER_API_KEY', 'sk-test')
os.environ.setdefault('TELEGRAM_BOT_TOKEN', '')
os.environ.setdefault('RELOAD_PORT', '8082')

import pytest


class _FakeFlaskApp:
    """Stand-in for `Flask` exposing only what scheduler needs: app_context() + .config."""

    def __init__(self):
        self.config = {'OPENROUTER_API_KEY': 'sk-test'}

    @contextlib.contextmanager
    def app_context(self):
        yield


@pytest.fixture(autouse=True)
def patch_flask_ctx(monkeypatch):
    """Replace `scheduler.flask_ctx.flask_app` with a no-op stub."""
    fake = _FakeFlaskApp()

    # Make sure `scheduler.flask_ctx` is loadable without doing the real `from app import create_app`.
    fake_module = types.ModuleType('scheduler.flask_ctx')
    fake_module.flask_app = fake
    monkeypatch.setitem(sys.modules, 'scheduler.flask_ctx', fake_module)
    yield fake


@pytest.fixture
def fake_app_models(monkeypatch):
    """Inject minimal stubs for the `app.*` modules scheduler imports.

    Returns a dict {module_name: MagicMock} so individual tests can configure
    behavior on demand.
    """
    stubs = {}

    def _install(mod_name: str, attrs: dict):
        mod = types.ModuleType(mod_name)
        for k, v in attrs.items():
            setattr(mod, k, v)
        monkeypatch.setitem(sys.modules, mod_name, mod)
        stubs[mod_name] = mod
        return mod

    # app.models.routine
    routine_model = MagicMock(name='RoutineModel')
    _install('app.models.routine', {'RoutineModel': routine_model})

    # app.models.routine_run
    routine_run_model = MagicMock(name='RoutineRunModel')
    _install('app.models.routine_run', {'RoutineRunModel': routine_run_model})

    # app.models.user
    user_model = MagicMock(name='UserModel')
    _install('app.models.user', {'UserModel': user_model})

    # app.models.conversation
    conv_model = MagicMock(name='ConversationModel')
    _install('app.models.conversation', {'ConversationModel': conv_model})

    # app.models.message
    msg_model = MagicMock(name='MessageModel')
    _install('app.models.message', {'MessageModel': msg_model})

    # app.models.knowledge_folder
    kf_model = MagicMock(name='KnowledgeFolderModel')
    _install('app.models.knowledge_folder', {'KnowledgeFolderModel': kf_model})

    # app.models.knowledge_item
    ki_model = MagicMock(name='KnowledgeItemModel')
    _install('app.models.knowledge_item', {'KnowledgeItemModel': ki_model})

    # app.services.openrouter_service
    openrouter = MagicMock(name='OpenRouterService')
    openrouter.build_enhanced_system_prompt = MagicMock(return_value='SYS')
    _install('app.services.openrouter_service', {'OpenRouterService': openrouter})

    # app.services.workflow_service
    workflow_service = MagicMock(name='WorkflowService')
    _install('app.services.workflow_service', {'WorkflowService': workflow_service})

    # app.models.llm_config — used by executor's project-lockdown pre-flight check
    llm_config_model = MagicMock(name='LLMConfigModel')
    llm_config_model.find_by_id = MagicMock(return_value=None)
    _install('app.models.llm_config', {'LLMConfigModel': llm_config_model})

    # app.models.workflow — used by executor's project-lockdown pre-flight check
    workflow_model = MagicMock(name='WorkflowModel')
    workflow_model.get_by_id = MagicMock(return_value=None)
    _install('app.models.workflow', {'WorkflowModel': workflow_model})

    # app.utils.config_resolver
    def _resolve_config(cid, user_id=None, project_id=None):
        return {
            '_id': cid,
            'model_id': 'openai/gpt-test',
            'name': 'Test Model',
            'system_prompt': '',
            'parameters': {'temperature': 0.7, 'max_tokens': 2048},
        }
    _install('app.utils.config_resolver', {'resolve_config': _resolve_config})

    # app.utils.telegram_format — used inside delivery._deliver_telegram (lazy import)
    _install('app.utils.telegram_format', {
        'md_to_tg_html': lambda s: s,
        'split_for_telegram': lambda s, max_len=4000: [s[i:i + max_len] for i in range(0, len(s), max_len)] or [s],
        'TG_MAX': 4000,
    })

    return {
        'RoutineModel': routine_model,
        'RoutineRunModel': routine_run_model,
        'UserModel': user_model,
        'ConversationModel': conv_model,
        'MessageModel': msg_model,
        'KnowledgeFolderModel': kf_model,
        'KnowledgeItemModel': ki_model,
        'OpenRouterService': openrouter,
        'WorkflowService': workflow_service,
        'LLMConfigModel': llm_config_model,
        'WorkflowModel': workflow_model,
    }
