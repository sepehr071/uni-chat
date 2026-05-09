"""Self-healing index creation for MongoDB schema drift.

Stale indexes from prior schema versions (different sparse flag, old
text-index field combos, renamed indexes) prevent fresh creation and
abort the whole startup index-build at the first conflict. This module
patches Collection.create_index for the duration of startup so that
schema-drift conflicts auto-drop the offender and retry.
"""
import logging
from contextlib import contextmanager

from pymongo.collection import Collection
from pymongo.errors import OperationFailure

logger = logging.getLogger(__name__)

INDEX_KEY_SPECS_CONFLICT = 86  # same name+keys, different options (e.g. sparse drift)
INDEX_OPTIONS_CONFLICT = 85    # same keys, different name
CANNOT_CREATE_INDEX = 67       # e.g. only one text index per collection allowed

_HEAL_CODES = (INDEX_KEY_SPECS_CONFLICT, INDEX_OPTIONS_CONFLICT, CANNOT_CREATE_INDEX)


def _normalize_keys(keys):
    if isinstance(keys, str):
        return [(keys, 1)]
    return list(keys)


def _is_text_spec(key_pairs):
    return any(direction == 'text' for _, direction in key_pairs)


@contextmanager
def self_healing_indexes():
    original = Collection.create_index

    def healing_create_index(self, keys, **kwargs):
        try:
            return original(self, keys, **kwargs)
        except OperationFailure as exc:
            code = getattr(exc, 'code', None)
            if code not in _HEAL_CODES:
                raise

            requested_pairs = _normalize_keys(keys)
            requested_fields = {f for f, _ in requested_pairs}
            requested_is_text = _is_text_spec(requested_pairs)
            requested_name = kwargs.get('name')

            dropped = []
            for idx in list(self.list_indexes()):
                idx_name = idx.get('name')
                if idx_name == '_id_':
                    continue
                idx_pairs = list(idx.get('key', {}).items())
                idx_fields = {f for f, _ in idx_pairs}
                idx_is_text = any(
                    d == 'text' or f in ('_fts', '_ftsx')
                    for f, d in idx_pairs
                )

                should_drop = False
                if requested_name and idx_name == requested_name:
                    should_drop = True
                elif requested_is_text and idx_is_text:
                    should_drop = True
                elif idx_fields == requested_fields:
                    should_drop = True

                if should_drop:
                    self.drop_index(idx_name)
                    dropped.append(idx_name)

            if not dropped:
                raise

            logger.info(
                'Self-healed indexes on %s: dropped %s, recreating with new spec',
                self.name, dropped,
            )
            return original(self, keys, **kwargs)

    Collection.create_index = healing_create_index
    try:
        yield
    finally:
        Collection.create_index = original
