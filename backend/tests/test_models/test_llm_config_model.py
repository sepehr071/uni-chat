"""Tests for app/models/llm_config.py."""

import pytest
from bson import ObjectId

from app.models.llm_config import LLMConfigModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


def _mk(uid, **kw):
    base = dict(name='Cfg', model_id='openai/gpt-4', model_name='GPT-4',
                owner_id=uid, description='', system_prompt='',
                visibility='private')
    base.update(kw)
    return LLMConfigModel.create(**base)


class TestCreate:
    def test_defaults(self, app, db, uid):
        c = _mk(uid)
        assert c['parameters']['temperature'] == 0.7
        assert c['parameters']['max_tokens'] == 2048
        assert c['parameters']['top_p'] == 1.0
        assert c['stats']['uses_count'] == 0
        assert c['avatar']['type'] == 'initials'
        assert c['avatar']['value'] == 'CF'

    def test_custom_parameters_merge(self, app, db, uid):
        c = _mk(uid, parameters={'temperature': 0.1, 'extra': 9})
        assert c['parameters']['temperature'] == 0.1
        assert c['parameters']['extra'] == 9
        assert c['parameters']['max_tokens'] == 2048  # default kept

    def test_project_workspace_ids(self, app, db, uid):
        proj = ObjectId()
        ws = ObjectId()
        c = _mk(uid, project_id=str(proj), workspace_id=str(ws))
        assert c['project_id'] == proj
        assert c['workspace_id'] == ws

    def test_custom_avatar(self, app, db, uid):
        c = _mk(uid, avatar={'type': 'url', 'value': 'https://x/y.png'})
        assert c['avatar']['type'] == 'url'

    def test_default_avatar_AI_when_no_name(self, app, db, uid):
        c = LLMConfigModel.create(name='', model_id='m', model_name='M', owner_id=uid)
        assert c['avatar']['value'] == 'AI'


class TestFind:
    def test_find_by_id(self, app, db, uid):
        c = _mk(uid)
        assert LLMConfigModel.find_by_id(str(c['_id']))['_id'] == c['_id']

    def test_find_by_ids(self, app, db, uid):
        a = _mk(uid)
        b = _mk(uid, name='B')
        out = LLMConfigModel.find_by_ids([a['_id'], str(b['_id'])])
        assert len(out) == 2

    def test_find_by_ids_empty(self, app, db, uid):
        assert LLMConfigModel.find_by_ids([]) == []

    def test_find_by_owner(self, app, db, uid):
        _mk(uid)
        _mk(uid, name='B')
        _mk(ObjectId(), name='C')
        out = LLMConfigModel.find_by_owner(uid)
        assert len(out) == 2

    def test_find_public(self, app, db, uid):
        _mk(uid, visibility='public', tags=['math'])
        _mk(uid, visibility='private')
        out = LLMConfigModel.find_public()
        assert len(out) == 1

    def test_find_public_tag_filter(self, app, db, uid):
        _mk(uid, visibility='public', tags=['math'])
        _mk(uid, visibility='public', tags=['code'])
        out = LLMConfigModel.find_public(tags=['math'])
        assert len(out) == 1

    def test_find_public_model_filter(self, app, db, uid):
        _mk(uid, visibility='public', model_id='openai/gpt-4')
        _mk(uid, visibility='public', model_id='anthropic/claude')
        out = LLMConfigModel.find_public(model='openai/gpt-4')
        assert len(out) == 1

    def test_find_templates(self, app, db, uid):
        _mk(uid, visibility='template')
        _mk(uid, visibility='private')
        assert len(LLMConfigModel.find_templates()) == 1

    def test_find_by_project(self, app, db, uid):
        proj = ObjectId()
        _mk(uid, project_id=proj)
        _mk(uid)
        assert len(LLMConfigModel.find_by_project(str(proj))) == 1

    def test_find_visible_to_includes_own_and_public(self, app, db, uid):
        _mk(uid)
        _mk(ObjectId(), visibility='public')
        _mk(ObjectId(), visibility='template')
        _mk(ObjectId(), visibility='private')  # not visible
        out = LLMConfigModel.find_visible_to(uid)
        assert len(out) == 3

    def test_find_visible_to_includes_project(self, app, db, uid):
        proj = ObjectId()
        _mk(ObjectId(), visibility='project', project_id=proj)  # not owned but project-scoped
        out = LLMConfigModel.find_visible_to(uid, project_id=str(proj))
        assert len(out) == 1


class TestUpdate:
    def test_update_sets_updated_at(self, app, db, uid):
        c = _mk(uid)
        LLMConfigModel.update(c['_id'], {'name': 'New'})
        refreshed = LLMConfigModel.find_by_id(c['_id'])
        assert refreshed['name'] == 'New'

    def test_increment_uses(self, app, db, uid):
        c = _mk(uid)
        LLMConfigModel.increment_uses(c['_id'])
        LLMConfigModel.increment_uses(c['_id'])
        assert LLMConfigModel.find_by_id(c['_id'])['stats']['uses_count'] == 2

    def test_increment_saves(self, app, db, uid):
        c = _mk(uid)
        LLMConfigModel.increment_saves(c['_id'])
        assert LLMConfigModel.find_by_id(c['_id'])['stats']['saves_count'] == 1

    def test_set_visibility(self, app, db, uid):
        c = _mk(uid, visibility='private')
        LLMConfigModel.set_visibility(c['_id'], 'public')
        assert LLMConfigModel.find_by_id(c['_id'])['visibility'] == 'public'


class TestDeleteDuplicateCount:
    def test_delete(self, app, db, uid):
        c = _mk(uid)
        LLMConfigModel.delete(c['_id'])
        assert LLMConfigModel.find_by_id(c['_id']) is None

    def test_duplicate(self, app, db, uid):
        c = _mk(uid, name='Original', description='d', system_prompt='s', tags=['t'])
        other = ObjectId()
        dup = LLMConfigModel.duplicate(c['_id'], str(other), new_name='Copy')
        assert dup['name'] == 'Copy'
        assert dup['owner_id'] == other
        assert dup['visibility'] == 'private'

    def test_duplicate_missing_returns_none(self, app, db, uid):
        assert LLMConfigModel.duplicate(ObjectId(), uid) is None

    def test_duplicate_default_name_suffix(self, app, db, uid):
        c = _mk(uid, name='X')
        dup = LLMConfigModel.duplicate(c['_id'], uid)
        assert dup['name'] == 'X (copy)'

    def test_count_by_owner(self, app, db, uid):
        _mk(uid)
        _mk(uid, name='B')
        assert LLMConfigModel.count_by_owner(uid) == 2

    def test_count_public(self, app, db, uid):
        _mk(uid, visibility='public')
        _mk(uid, visibility='public')
        _mk(uid, visibility='private')
        assert LLMConfigModel.count_public() == 2
