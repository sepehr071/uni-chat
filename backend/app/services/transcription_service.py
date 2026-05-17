"""
Transcription service — sync wrapper around ElevenLabs Scribe v2.

Persian-only (`language_code='fas'`), diarized, word-level timestamps. The
ElevenLabs Python SDK is sync-friendly; this module is intentionally
plain-sync so the background thread launched by the meetings pipeline can
call into it without an event loop.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from flask import current_app

logger = logging.getLogger(__name__)


_WORD_TYPES_FOR_TEXT = {"word", "spacing"}


@dataclass
class TranscriptionResult:
    plain_text: str
    words: list[dict]
    speaker_ids: list[str]
    raw: dict
    language_code: str


def _resolve_api_key() -> str:
    """Pick the key from Flask config first (test/runtime override), then env."""
    try:
        key = (current_app.config.get('ELEVENLABS_API_KEY') or '').strip()
        if key:
            return key
    except RuntimeError:
        # No app context — fall through to env.
        pass
    return (os.environ.get('ELEVENLABS_API_KEY') or '').strip()


def _serialize_word(word: Any) -> dict:
    if hasattr(word, 'model_dump'):
        return word.model_dump()
    if isinstance(word, dict):
        return dict(word)
    return {
        'text': getattr(word, 'text', ''),
        'start': getattr(word, 'start', None),
        'end': getattr(word, 'end', None),
        'type': getattr(word, 'type', None),
        'speaker_id': getattr(word, 'speaker_id', None),
    }


def _serialize_response(response: Any) -> dict:
    if hasattr(response, 'model_dump'):
        return response.model_dump()
    if isinstance(response, dict):
        return dict(response)
    return {}


def transcribe(
    audio_path: str | Path,
    *,
    num_speakers: int | None = None,
    keyterms: list[str] | None = None,
) -> TranscriptionResult:
    """Synchronous Scribe v2 call. Returns a `TranscriptionResult`.

    Raises ``RuntimeError`` with a friendly message on any SDK / network /
    HTTP failure so the pipeline can flip the meeting to FAILED w/ context.
    """
    audio_path = Path(audio_path)
    api_key = _resolve_api_key()
    if not api_key:
        raise RuntimeError("Scribe failed: ELEVENLABS_API_KEY is not configured")

    # Lazy import so a missing dependency surfaces at call-time (not import-time).
    try:
        from elevenlabs import ElevenLabs
    except Exception as exc:  # pragma: no cover - import-time failure
        raise RuntimeError(f"Scribe failed: elevenlabs SDK not installed ({exc})") from exc

    client = ElevenLabs(api_key=api_key)

    kwargs: dict[str, Any] = {
        'model_id': 'scribe_v2',
        'language_code': 'fas',
        'diarize': True,
        'timestamps_granularity': 'word',
        'tag_audio_events': False,
        'no_verbatim': True,
    }
    if num_speakers is not None and num_speakers > 0:
        kwargs['num_speakers'] = int(num_speakers)
    if keyterms:
        # Defensive copy — never hand the SDK a live reference to caller state.
        kwargs['keyterms'] = list(keyterms)

    try:
        with audio_path.open('rb') as fp:
            response = client.speech_to_text.convert(file=fp, **kwargs)
    except Exception as exc:
        raise RuntimeError(f"Scribe failed: {exc}") from exc

    raw_words = getattr(response, 'words', None) or []
    serialized_words = [_serialize_word(w) for w in raw_words]

    plain_text_parts: list[str] = []
    speaker_ids: list[str] = []
    seen_speakers: set[str] = set()

    for word in serialized_words:
        word_type = word.get('type')
        if word_type in _WORD_TYPES_FOR_TEXT:
            plain_text_parts.append(word.get('text', '') or '')
        speaker_id = word.get('speaker_id')
        if speaker_id is not None and speaker_id not in seen_speakers:
            seen_speakers.add(speaker_id)
            speaker_ids.append(speaker_id)

    plain_text = ''.join(plain_text_parts)
    language_code = getattr(response, 'language_code', None) or 'fas'
    raw = _serialize_response(response)

    return TranscriptionResult(
        plain_text=plain_text,
        words=serialized_words,
        speaker_ids=speaker_ids,
        raw=raw,
        language_code=language_code,
    )
