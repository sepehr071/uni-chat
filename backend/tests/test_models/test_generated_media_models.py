"""Tests for app/models/generated_image.py, generated_audio.py, generated_video.py, prompt_template.py."""

import pytest
from bson import ObjectId

from app.models.generated_audio import GeneratedAudioModel
from app.models.generated_image import GeneratedImageModel
from app.models.generated_video import GeneratedVideoModel
from app.models.prompt_template import PromptTemplateModel


@pytest.fixture
def uid(app, db):
    return ObjectId()


# ---------------------------------------------------------------------------
# GeneratedImage
# ---------------------------------------------------------------------------

class TestGeneratedImage:
    def test_create_and_find(self, app, db, uid):
        img = GeneratedImageModel.create(str(uid), 'p', 'm', 'data:image/png;base64,X')
        assert img['prompt'] == 'p'
        assert GeneratedImageModel.find_by_id(img['_id']) is not None

    def test_find_by_user_with_favorites_filter(self, app, db, uid):
        a = GeneratedImageModel.create(str(uid), 'p1', 'm', 'data')
        GeneratedImageModel.create(str(uid), 'p2', 'm', 'data')
        GeneratedImageModel.toggle_favorite(a['_id'])
        all_imgs = GeneratedImageModel.find_by_user(str(uid))
        favs = GeneratedImageModel.find_by_user(str(uid), favorites_only=True)
        assert len(all_imgs) == 2
        assert len(favs) == 1

    def test_count_by_user(self, app, db, uid):
        GeneratedImageModel.create(str(uid), 'p', 'm', 'd')
        assert GeneratedImageModel.count_by_user(str(uid)) == 1

    def test_toggle_favorite(self, app, db, uid):
        img = GeneratedImageModel.create(str(uid), 'p', 'm', 'd')
        new = GeneratedImageModel.toggle_favorite(img['_id'])
        assert new is True
        new2 = GeneratedImageModel.toggle_favorite(img['_id'])
        assert new2 is False

    def test_delete_many(self, app, db, uid):
        a = GeneratedImageModel.create(str(uid), 'p', 'm', 'd')
        b = GeneratedImageModel.create(str(uid), 'p', 'm', 'd')
        # Other user's image - not deleted.
        c = GeneratedImageModel.create(str(ObjectId()), 'p', 'm', 'd')
        n = GeneratedImageModel.delete_many([str(a['_id']), str(b['_id']),
                                              str(c['_id'])], str(uid))
        assert n == 2


# ---------------------------------------------------------------------------
# GeneratedAudio
# ---------------------------------------------------------------------------

class TestGeneratedAudio:
    def _audio(self, uid):
        return GeneratedAudioModel.create(
            user_id=str(uid), text='hello', model='tts-1',
            voice='alloy', speed=1.0, mime='audio/mpeg',
            audio_data_uri='data:audio/mpeg;base64,XXX',
        )

    def test_create_and_find(self, app, db, uid):
        a = self._audio(uid)
        assert a['text'] == 'hello'
        assert GeneratedAudioModel.find_by_id(a['_id']) is not None

    def test_find_by_user(self, app, db, uid):
        self._audio(uid)
        self._audio(uid)
        out = GeneratedAudioModel.find_by_user(str(uid))
        assert len(out) == 2

    def test_delete(self, app, db, uid):
        a = self._audio(uid)
        GeneratedAudioModel.delete(a['_id'])
        assert GeneratedAudioModel.find_by_id(a['_id']) is None


# ---------------------------------------------------------------------------
# GeneratedVideo
# ---------------------------------------------------------------------------

class TestGeneratedVideo:
    def _video(self, uid, url='https://x/a.mp4'):
        return GeneratedVideoModel.create(
            user_id=str(uid), prompt='p', model='m',
            local_path='/tmp/a.mp4', video_url=url,
            openrouter_generation_id='gen-1',
        )

    def test_create_and_find(self, app, db, uid):
        v = self._video(uid)
        assert v['prompt'] == 'p'
        assert GeneratedVideoModel.find_by_id(v['_id']) is not None

    def test_find_by_user(self, app, db, uid):
        self._video(uid)
        self._video(uid, 'https://x/b.mp4')
        out = GeneratedVideoModel.find_by_user(str(uid))
        assert len(out) == 2

    def test_delete(self, app, db, uid):
        v = self._video(uid)
        GeneratedVideoModel.delete(v['_id'])
        assert GeneratedVideoModel.find_by_id(v['_id']) is None


# ---------------------------------------------------------------------------
# PromptTemplate
# ---------------------------------------------------------------------------

class TestPromptTemplate:
    def test_create_find_by_id(self, app, db, uid):
        t = PromptTemplateModel.create('Pic', 'art', 'paint {x}',
                                         variables=['x'], description='d',
                                         created_by=str(uid))
        assert t['name'] == 'Pic'
        assert PromptTemplateModel.find_by_id(str(t['_id'])) is not None

    def test_find_all_active(self, app, db, uid):
        PromptTemplateModel.create('A', 'art', 'x')
        PromptTemplateModel.create('B', 'art', 'y')
        out = PromptTemplateModel.find_all_active()
        assert len(out) == 2

    def test_find_by_category(self, app, db, uid):
        PromptTemplateModel.create('A', 'art', 'x')
        PromptTemplateModel.create('B', 'code', 'y')
        out = PromptTemplateModel.find_by_category('art')
        assert len(out) == 1

    def test_get_categories(self, app, db, uid):
        PromptTemplateModel.create('A', 'art', 'x')
        PromptTemplateModel.create('B', 'art', 'y')
        PromptTemplateModel.create('C', 'code', 'z')
        cats = {c['category'] for c in PromptTemplateModel.get_categories()}
        assert cats == {'art', 'code'}

    def test_update_and_increment(self, app, db, uid):
        t = PromptTemplateModel.create('A', 'art', 'x')
        ok = PromptTemplateModel.update(str(t['_id']), {'name': 'B'})
        assert ok is True
        PromptTemplateModel.increment_usage(str(t['_id']))
        refreshed = PromptTemplateModel.find_by_id(str(t['_id']))
        assert refreshed['name'] == 'B'
        assert refreshed['usage_count'] == 1

    def test_soft_delete(self, app, db, uid):
        t = PromptTemplateModel.create('A', 'art', 'x')
        ok = PromptTemplateModel.delete(str(t['_id']))
        assert ok is True
        refreshed = PromptTemplateModel.find_by_id(str(t['_id']))
        assert refreshed['is_active'] is False
