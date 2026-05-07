"""
Role enum collapse migration: map legacy roles to the new 3-tier enum.

Mappings:
  workspace_members.role: guest→viewer, billing-admin→editor, admin→owner
  workspace_invites.role:  guest→viewer, billing-admin→editor, admin→owner
  project_members.role:    guest→viewer, billing-admin→editor, admin→editor

Optional --promote-managers <email,email,...>: set users.role='manager' for those emails.

Idempotent: re-running after a clean migration yields zero updates.

Usage:
    python scripts/migrate_collapse_roles.py             # dry-run (default)
    python scripts/migrate_collapse_roles.py --dry-run   # explicit dry-run
    python scripts/migrate_collapse_roles.py --apply     # write changes
    python scripts/migrate_collapse_roles.py --apply --promote-managers ceo@acme.com,mgr@acme.com
"""

import argparse
import os
import sys

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()


def get_db():
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    return client.get_database()


def histogram(collection, field='role'):
    pipeline = [
        {'$group': {'_id': f'${field}', 'count': {'$sum': 1}}},
        {'$sort': {'_id': 1}},
    ]
    return {r['_id']: r['count'] for r in collection.aggregate(pipeline)}


def migrate_collection(db, coll_name, role_map, dry_run):
    col = db[coll_name]
    before = histogram(col)
    total_updated = 0

    for old_role, new_role in role_map.items():
        affected = col.count_documents({'role': old_role})
        if affected == 0:
            continue
        print(f"  {coll_name}: {old_role!r} → {new_role!r}  ({affected} docs)")
        if not dry_run:
            result = col.update_many({'role': old_role}, {'$set': {'role': new_role}})
            total_updated += result.modified_count

    after = histogram(col)
    print(f"  Before: {before}")
    print(f"  After:  {after if not dry_run else '(dry-run — not applied)'}")
    return total_updated


def promote_managers(db, emails, dry_run):
    users_col = db['users']
    email_list = [e.strip().lower() for e in emails if e.strip()]
    if not email_list:
        return
    affected = users_col.count_documents({'email': {'$in': email_list}})
    print(f"\nusers: promote {affected} accounts to 'manager': {email_list}")
    if not dry_run:
        users_col.update_many(
            {'email': {'$in': email_list}},
            {'$set': {'role': 'manager'}},
        )


def main():
    parser = argparse.ArgumentParser(description='Collapse legacy workspace/project roles.')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', default=True,
                      help='Preview changes without writing (default)')
    mode.add_argument('--apply', action='store_true', default=False,
                      help='Write changes to MongoDB')
    parser.add_argument('--promote-managers', default='',
                        help='Comma-separated emails to set role=manager on users collection')
    args = parser.parse_args()

    dry_run = not args.apply
    label = 'DRY-RUN' if dry_run else 'APPLY'
    print(f"\n=== migrate_collapse_roles [{label}] ===\n")

    db = get_db()

    # workspace_members + workspace_invites: guest→viewer, billing-admin→editor, admin→owner
    ws_role_map = {
        'guest': 'viewer',
        'billing-admin': 'editor',
        'admin': 'owner',
    }

    # project_members: admin downgrades to editor (workspace owner is effective project owner)
    pm_role_map = {
        'guest': 'viewer',
        'billing-admin': 'editor',
        'admin': 'editor',
    }

    total = 0
    for coll in ('workspace_members', 'workspace_invites'):
        print(f"\n[{coll}]")
        total += migrate_collection(db, coll, ws_role_map, dry_run)

    print(f"\n[project_members]")
    total += migrate_collection(db, 'project_members', pm_role_map, dry_run)

    if args.promote_managers:
        promote_managers(db, args.promote_managers.split(','), dry_run)

    print(f"\n{'Total docs updated: ' + str(total) if not dry_run else 'Dry-run complete — rerun with --apply to write changes.'}")


if __name__ == '__main__':
    main()
