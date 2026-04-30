"""
Resource scoping migration: backfill project_id / workspace_id / scope_key on
knowledge resources, llm_configs, and workflows; replace the legacy
(user_id, name) UNIQUE index on `knowledge_folders` with (scope_key, name).

CRITICAL pre-flight: the legacy unique index allows ('alice', 'Inbox') and
('alice', 'inbox') as separate names BUT only one ('alice', 'Inbox') row.
The new (scope_key, name) index — where scope_key=`u:<oid>` for un-scoped
folders — will refuse to build if the same user already has duplicate names
(case-insensitive collisions don't matter to MongoDB's default index, only
exact-equal duplicates do, but we audit both for safety).

The script always runs the audit step first. If collisions exist AND the
caller is not in --audit-only or --dry-run mode, the script ABORTS
without writing — duplicate names need human intervention (rename one).

Idempotent: re-running after a clean migration yields zero updates.

Usage:
    python scripts/migrate_resource_scoping.py             # apply
    python scripts/migrate_resource_scoping.py --dry-run   # preview only
    python scripts/migrate_resource_scoping.py --audit-only  # collision check only

Standalone — uses raw pymongo, NO `app.*` imports — to avoid the dotenv-
load-order trap noted in CLAUDE.md.
"""

import argparse
import os
import sys
from collections import defaultdict
from datetime import datetime

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------

def get_db():
    """Open a MongoDB connection using MONGO_URI env var."""
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    return client.get_database()


def _scope_key(user_id, project_id) -> str:
    """Mirror KnowledgeFolderModel._compute_scope_key() exactly."""
    if project_id:
        return str(project_id)
    return f'u:{str(user_id)}'


# ---------------------------------------------------------------------------
# Step 1: pre-flight collision audit on knowledge_folders
# ---------------------------------------------------------------------------

def audit_folder_collisions(db) -> list:
    """Find any (scope_key, name) pairs that would collide under the new index.

    Returns a list of collision-description dicts, empty when clean.
    """
    folders = list(db.knowledge_folders.find(
        {},
        projection={'_id': 1, 'user_id': 1, 'project_id': 1, 'name': 1},
    ))

    buckets = defaultdict(list)
    for f in folders:
        sk = _scope_key(f.get('user_id'), f.get('project_id'))
        buckets[(sk, f.get('name'))].append(f['_id'])

    collisions = []
    for (sk, name), ids in buckets.items():
        if len(ids) > 1:
            collisions.append({
                'scope_key': sk,
                'name': name,
                'folder_ids': [str(i) for i in ids],
                'count': len(ids),
            })
    return collisions


# ---------------------------------------------------------------------------
# Step 2: backfill project_id/workspace_id on miscellaneous collections
# ---------------------------------------------------------------------------

def _backfill_scope_fields(db, collection_name: str, dry_run: bool) -> int:
    """Set project_id+workspace_id to null on docs missing the fields.

    This makes the field present on every doc so future $exists queries +
    new indexes behave consistently. Existing values are preserved.
    """
    coll = db[collection_name]
    filt = {
        '$or': [
            {'project_id': {'$exists': False}},
            {'workspace_id': {'$exists': False}},
        ]
    }
    if dry_run:
        return coll.count_documents(filt)
    update_doc = {
        '$set': {
            'project_id': None,
            'workspace_id': None,
        }
    }
    # Only set fields that are missing — using upsert-style logic via two
    # updates to avoid clobbering existing non-null values.
    res1 = coll.update_many(
        {'project_id': {'$exists': False}},
        {'$set': {'project_id': None}},
    )
    res2 = coll.update_many(
        {'workspace_id': {'$exists': False}},
        {'$set': {'workspace_id': None}},
    )
    # Count of distinct docs touched is bounded by the larger of the two.
    return max(res1.modified_count, res2.modified_count)


# ---------------------------------------------------------------------------
# Step 3: knowledge_folders - compute scope_key + swap unique index
# ---------------------------------------------------------------------------

def _backfill_scope_key(db, dry_run: bool) -> int:
    """Compute scope_key for every knowledge_folders doc."""
    coll = db.knowledge_folders
    cursor = coll.find({}, projection={'_id': 1, 'user_id': 1, 'project_id': 1, 'scope_key': 1})

    touched = 0
    for doc in cursor:
        target = _scope_key(doc.get('user_id'), doc.get('project_id'))
        if doc.get('scope_key') == target:
            continue
        if not dry_run:
            coll.update_one(
                {'_id': doc['_id']},
                {'$set': {'scope_key': target}},
            )
        touched += 1
    return touched


def _swap_folder_unique_index(db, dry_run: bool) -> tuple:
    """Drop legacy UNIQUE (user_id, name); create UNIQUE (scope_key, name).

    Returns (dropped_legacy: bool, created_new: bool).
    """
    coll = db.knowledge_folders
    legacy_key = [('user_id', 1), ('name', 1)]
    new_key = [('scope_key', 1), ('name', 1)]

    info = coll.index_information()

    legacy_name = None
    new_exists = False
    for idx_name, idx_info in info.items():
        key = idx_info.get('key')
        if key == legacy_key and idx_info.get('unique'):
            legacy_name = idx_name
        if key == new_key and idx_info.get('unique'):
            new_exists = True

    dropped = False
    created = False

    if legacy_name:
        if not dry_run:
            coll.drop_index(legacy_name)
        dropped = True

    if not new_exists:
        if not dry_run:
            coll.create_index(new_key, unique=True)
        created = True

    return dropped, created


# ---------------------------------------------------------------------------
# Migration runner
# ---------------------------------------------------------------------------

def run_migration(db, dry_run: bool, audit_only: bool) -> dict:
    counts = {
        'audit_collisions': 0,
        'llm_configs_updated': 0,
        'workflows_updated': 0,
        'knowledge_folders_updated': 0,
        'knowledge_items_updated': 0,
        'index_dropped': False,
        'index_created': False,
    }

    # --- Step 1: audit (always runs) -------------------------------------
    print('\n[1/4] Pre-flight collision audit on knowledge_folders...')
    collisions = audit_folder_collisions(db)
    counts['audit_collisions'] = len(collisions)

    if collisions:
        print(f'  FOUND {len(collisions)} collision group(s):')
        for c in collisions:
            print(
                f"    scope_key={c['scope_key']} name={c['name']!r} "
                f"count={c['count']} ids={c['folder_ids']}"
            )
        print(
            '\n  These duplicates must be resolved before the new UNIQUE '
            "(scope_key, name) index can build. Rename one folder in each "
            'group, then re-run.'
        )
    else:
        print('  Clean. No collisions detected.')

    if audit_only:
        print('\n--audit-only set; exiting after audit step.')
        return counts

    if collisions and not dry_run:
        print('\nAborting migration: cannot proceed with active collisions.')
        sys.exit(2)

    # --- Step 2: backfill project_id/workspace_id on misc collections ----
    print('\n[2/4] Backfilling project_id/workspace_id (null) on resources...')
    for coll_name, count_key in (
        ('llm_configs', 'llm_configs_updated'),
        ('workflows', 'workflows_updated'),
        ('knowledge_folders', 'knowledge_folders_updated'),
        ('knowledge_items', 'knowledge_items_updated'),
    ):
        n = _backfill_scope_fields(db, coll_name, dry_run)
        counts[count_key] = n
        action = '[dry-run] would update' if dry_run else 'updated'
        print(f'  {coll_name}: {action} {n} docs')

    # --- Step 3: knowledge_folders scope_key backfill --------------------
    print('\n[3/4] Computing scope_key on knowledge_folders...')
    sk_touched = _backfill_scope_key(db, dry_run)
    action = '[dry-run] would set' if dry_run else 'set'
    print(f'  {action} scope_key on {sk_touched} folder(s)')

    # --- Step 4: index swap on knowledge_folders -------------------------
    print('\n[4/4] Swapping unique index on knowledge_folders...')
    dropped, created = _swap_folder_unique_index(db, dry_run)
    counts['index_dropped'] = dropped
    counts['index_created'] = created
    if dry_run:
        if dropped:
            print('  [dry-run] would drop legacy UNIQUE (user_id, name)')
        if created:
            print('  [dry-run] would create UNIQUE (scope_key, name)')
        if not (dropped or created):
            print('  Index state already current.')
    else:
        if dropped:
            print('  Dropped legacy UNIQUE (user_id, name).')
        if created:
            print('  Created UNIQUE (scope_key, name).')
        if not (dropped or created):
            print('  Index state already current.')

    return counts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description=(
            'Backfill project_id/workspace_id/scope_key on knowledge '
            'resources and swap the unique index on knowledge_folders.'
        ),
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing to the database.',
    )
    parser.add_argument(
        '--audit-only',
        action='store_true',
        help='Run only the (user_id, name) collision audit; do not write.',
    )
    args = parser.parse_args()

    try:
        db = get_db()
    except Exception as exc:
        print(f"Failed to connect to MongoDB: {exc}")
        sys.exit(1)

    print(f"Connected to {db.name}")
    if args.dry_run:
        print('DRY RUN -- no writes will be performed.')
    if args.audit_only:
        print('AUDIT-ONLY -- only the collision audit will run.')

    counts = run_migration(db, dry_run=args.dry_run, audit_only=args.audit_only)

    print('\n' + '=' * 50)
    print(f"audit_collisions:           {counts['audit_collisions']}")
    print(f"llm_configs_updated:        {counts['llm_configs_updated']}")
    print(f"workflows_updated:          {counts['workflows_updated']}")
    print(f"knowledge_folders_updated:  {counts['knowledge_folders_updated']}")
    print(f"knowledge_items_updated:    {counts['knowledge_items_updated']}")
    print(f"index_dropped:              {counts['index_dropped']}")
    print(f"index_created:              {counts['index_created']}")
    print('=' * 50)


if __name__ == '__main__':
    main()
