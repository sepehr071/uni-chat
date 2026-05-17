"""
Audio upload — verifies 500MB cap is bypassed (not actually uploading 500MB
— we monkeypatch ``MEETING_MAX_AUDIO_BYTES`` to a small value), partial-file
cleanup on overflow, owner-only stream returns 404 not 403, and that
multipart parsing accepts the streamed body.
"""
from __future__ import annotations

import io
import os
import threading
from pathlib import Path
from unittest.mock import patch

import pytest


@pytest.fixture(autouse=True)
def enable_meetings_feature(app, db):
    """See ``test_meetings_routes.py`` for the title_text drop rationale."""
    from app.models.platform_settings import PlatformSettingsModel, SINGLETON_ID
    with app.app_context():
        PlatformSettingsModel.get_collection().update_one(
            {'_id': SINGLETON_ID},
            {'$set': {'features.meetings': True}, '$setOnInsert': {'_id': SINGLETON_ID}},
            upsert=True,
        )
        from app.models.meeting import MeetingModel
        col = MeetingModel.get_collection()
        try:
            if 'title_text' in col.index_information():
                col.drop_index('title_text')
        except Exception:
            pass


@pytest.fixture(autouse=True)
def _isolate_uploads(app, tmp_path, monkeypatch):
    """Point UPLOAD_FOLDER at tmp_path so we don't pollute the real uploads/ dir."""
    monkeypatch.setitem(app.config, 'UPLOAD_FOLDER', str(tmp_path))
    monkeypatch.setitem(app.config, 'MEETING_UPLOAD_SUBDIR', 'meetings')
    yield


@pytest.fixture(autouse=True)
def _no_background_dispatch(monkeypatch):
    """Stub out the background thread so tests don't kick off Scribe."""
    monkeypatch.setattr('app.routes.meetings._dispatch_pipeline', lambda mid: None)


class TestUploadSizeCap:
    def test_upload_within_cap_succeeds(self, app, db, client, auth_headers, monkeypatch):
        # Tiny cap.
        monkeypatch.setitem(app.config, 'MEETING_MAX_AUDIO_BYTES', 1024 * 1024)
        # ffprobe is best-effort; force None so we don't depend on the binary.
        monkeypatch.setattr(
            'app.routes.meetings.meeting_storage.probe_duration_seconds',
            lambda p: None,
        )

        payload = b'\x00' * 1024  # 1 KB
        data = {
            'file': (io.BytesIO(payload), 'sample.mp3', 'audio/mpeg'),
            'title': 'tiny',
        }
        r = client.post(
            '/api/meetings/upload',
            data=data,
            headers={
                'Authorization': auth_headers['Authorization'],
            },
            content_type='multipart/form-data',
        )
        assert r.status_code == 201
        body = r.get_json()
        assert body['meeting']['title']
        # On-disk artifact written under tmp UPLOAD_FOLDER.
        ap = body['meeting']['audio_path']
        assert os.path.exists(ap)

    def test_upload_exceeds_cap_413(self, app, db, client, auth_headers, monkeypatch):
        monkeypatch.setitem(app.config, 'MEETING_MAX_AUDIO_BYTES', 64)  # 64 bytes
        monkeypatch.setattr(
            'app.routes.meetings.meeting_storage.probe_duration_seconds',
            lambda p: None,
        )

        payload = b'\x00' * 1024  # 1 KB > 64 B cap
        data = {
            'file': (io.BytesIO(payload), 'big.mp3', 'audio/mpeg'),
        }
        r = client.post(
            '/api/meetings/upload',
            data=data,
            headers={'Authorization': auth_headers['Authorization']},
            content_type='multipart/form-data',
        )
        assert r.status_code in (413, 400)  # Flask may short-circuit to 413


class TestPartialCleanup:
    def test_overflow_cleans_partial_file(self, app, db, client, auth_headers, monkeypatch, tmp_path):
        monkeypatch.setitem(app.config, 'MEETING_MAX_AUDIO_BYTES', 32)
        monkeypatch.setattr(
            'app.routes.meetings.meeting_storage.probe_duration_seconds',
            lambda p: None,
        )

        # 2 MB body so save_audio_stream sees several chunks before bailing.
        payload = b'\x00' * (2 * 1024 * 1024)
        data = {
            'file': (io.BytesIO(payload), 'big.mp3', 'audio/mpeg'),
        }
        client.post(
            '/api/meetings/upload',
            data=data,
            headers={'Authorization': auth_headers['Authorization']},
            content_type='multipart/form-data',
        )
        # Partial file under tmp_path / meetings / <user_id> should be empty.
        meetings_dir = Path(tmp_path) / 'meetings'
        leftover = list(meetings_dir.rglob('*'))
        # We allow the user-id directory to exist but no leftover files inside.
        files = [p for p in leftover if p.is_file()]
        assert files == []


class TestOwnerOnlyAudio:
    def test_owner_can_stream(self, app, db, client, test_user, auth_headers, tmp_path):
        from app.models.meeting import MeetingModel
        audio = tmp_path / 'mine.mp3'
        audio.write_bytes(b'\x01\x02\x03')
        with app.app_context():
            mid = MeetingModel.create(str(test_user['_id']), {
                'original_filename': 'mine.mp3',
                'audio_path': str(audio),
                'title': 'mine',
            })
        r = client.get(f'/api/meetings/{mid}/audio', headers=auth_headers)
        assert r.status_code == 200

    def test_non_owner_404_not_403(self, app, db, client, admin_user, auth_headers, tmp_path):
        from app.models.meeting import MeetingModel
        audio = tmp_path / 'admin.mp3'
        audio.write_bytes(b'\x01\x02\x03')
        with app.app_context():
            mid = MeetingModel.create(str(admin_user['_id']), {
                'original_filename': 'admin.mp3',
                'audio_path': str(audio),
                'title': 'admin',
            })
        r = client.get(f'/api/meetings/{mid}/audio', headers=auth_headers)
        # 404 (not 403) to avoid leaking existence.
        assert r.status_code == 404
