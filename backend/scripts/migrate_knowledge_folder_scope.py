"""
P1.25 — Knowledge folder scope_key migration.

Re-key existing ``knowledge_folders`` documents so the ``scope_key`` field
matches the corrected ``_compute_scope_key`` logic:

* Project-scoped folders: ``scope_key = f'p:{project_id}'``
  (was bare ``str(project_id)``)
* Un-scoped (per-user) folders: ``scope_key = f'u:{user_id}'``
  (unchanged — already correct)

The legacy bare-ObjectId-string format collided in principle with the
user-scope namespace (hex ObjectId vs ``u:<oid>``) and made it hard to
tell at-a-glance from raw collection data which scope a key belongs to.

The compound unique index ``(scope_key, name)`` is dropped and recreated
after backfill because we're rewriting the scope_key column under it.

Idempotent — re-running after a clean migration yields zero updates.

Standalone — raw pymongo, no ``app.*`` imports — to avoid the dotenv
load-order trap noted in CLAUDE.md.

Usage:
    python scripts/migrate_knowledge_folder_scope.py             # apply
    python scripts/migrate_knowledge_folder_scope.py --dry-run   # preview
"""

import argparse
import os
import sys
from datetime import datetime

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()


def get_db():
    """Open a MongoDB connection using MONGO_URI env var."""
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    return client.get_database()


def compute_new_scope_key(user_id, project_id):
    """Match the post-P1.25 ``_compute_scope_key`` in
    ``app/models/knowledge_folder.py``."""
    if project_id:
        return f'p:{str(project_id)}'
    return f'u:{str(user_id)}'


def audit_collisions(coll):
    """Detect (new_scope_key, name) collisions before flipping the index.

    Returns a list of collision groups. Empty list = safe to migrate.
    """
    groups = {}
    for doc in coll.find({}):
        new_key = compute_new_scope_key(doc.get('user_id'), doc.get('project_id'))
        name = doc.get('name')
        groups.setdefault((new_key, name), []).append(doc['_id'])
    collisions = [
        {'scope_key': k[0], 'name': k[1], 'ids': v}
        for k, v in groups.items() if len(v) > 1
    ]
    return collisions


def migrate(dry_run=False):
    db = get_db()
    coll = db['knowledge_folders']

    total = coll.count_documents({})
    print(f'[audit] {total} folder documents found.')

    collisions = audit_collisions(coll)
    if collisions:
        print(f'[abort] {len(collisions)} (scope_key, name) collisions would '
              f'be introduced. Resolve by renaming one folder per group:')
        for c in collisions[:20]:
            print(f'  - {c["scope_key"]!r} + {c["name"]!r}: ids={c["ids"]}')
        if not dry_run:
            sys.exit(1)

    needs_update = 0
    for doc in coll.find({}):
        new_key = compute_new_scope_key(doc.get('user_id'), doc.get('project_id'))
        if doc.get('scope_key') != new_key:
            needs_update += 1

    print(f'[plan] {needs_update}/{total} folders need scope_key rewrite.')
    if dry_run:
        print('[dry-run] no writes performed.')
        return

    if needs_update == 0:
        print('[done] nothing to migrate.')
        return

    # Drop the old unique index before rewriting scope_key so partial state
    # mid-loop doesn't violate the constraint.
    try:
        for idx_name, info in coll.index_information().items():
            if info.get('unique') and info.get('key') == [('scope_key', 1), ('name', 1)]:
                coll.drop_index(idx_name)
                print(f'[idx] dropped {idx_name}')
    except Exception as e:
        print(f'[warn] could not drop legacy index: {e}')

    now = datetime.utcnow()
    updated = 0
    for doc in coll.find({}):
        new_key = compute_new_scope_key(doc.get('user_id'), doc.get('project_id'))
        if doc.get('scope_key') != new_key:
            coll.update_one(
                {'_id': doc['_id']},
                {'$set': {'scope_key': new_key, 'updated_at': now}},
            )
            updated += 1

    print(f'[done] rewrote {updated} folders.')

    # Re-create the unique index after backfill.
    coll.create_index([('scope_key', 1), ('name', 1)], unique=True)
    print('[idx] (scope_key, name) UNIQUE recreated.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true',
                        help='Preview changes without writing.')
    args = parser.parse_args()
    migrate(dry_run=args.dry_run)


if __name__ == '__main__':
    main()
