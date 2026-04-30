"""
Backfill personal workspaces for legacy users.

For every user without `active_workspace_id`, this script:
    1. Reuses an existing personal workspace if one already exists for them
       (i.e. matches `owner_id` + `type='personal'`), otherwise creates one.
    2. Ensures an owner-role membership row exists in `workspace_members`.
    3. Sets `users.active_workspace_id` to the personal workspace `_id`.

Idempotent: re-running yields counts of 0/0/0/0.

Usage:
    python scripts/migrate_workspaces.py             # apply changes
    python scripts/migrate_workspaces.py --dry-run   # preview only

This is a standalone script — uses raw pymongo, NO `app.*` imports — to avoid
the dotenv-load-order trap noted in CLAUDE.md.
"""

import argparse
import os
import re
import sys
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


_SLUG_RE = re.compile(r'[^a-z0-9]+')


def _slugify(value: str) -> str:
    """Lowercase, dash-separated slug for personal workspace identifier."""
    if not value:
        return 'workspace'
    s = _SLUG_RE.sub('-', value.strip().lower()).strip('-')
    return s or 'workspace'


def _unique_personal_slug(db, slug: str, owner_id: ObjectId) -> str:
    """Resolve a slug collision by appending an owner-suffix.

    `slug` is expected to already be slugified.
    """
    slug = slug or 'personal'
    existing = db.workspaces.find_one({'slug': slug})
    if existing and existing.get('owner_id') == owner_id:
        return slug
    if existing:
        return f"{slug}-{str(owner_id)[-6:]}"
    return slug


def _initials(name: str) -> str:
    """Match WorkspaceModel.create()'s default avatar generation."""
    parts = [p[0] for p in (name or 'W').split() if p]
    return (''.join(parts)[:2].upper()) or 'W'


def _build_workspace_doc(owner_id: ObjectId, display_name: str) -> dict:
    """Construct the workspace doc — mirrors WorkspaceModel.create_personal()."""
    now = datetime.utcnow()
    name = f"{display_name}'s Space"
    return {
        'name': name,
        'type': 'personal',
        'owner_id': owner_id,
        'plan': 'free',
        'avatar': {'type': 'initials', 'value': _initials(name)},
        'settings': {},
        'created_at': now,
        'updated_at': now,
    }


def _build_member_doc(workspace_id: ObjectId, user_id: ObjectId) -> dict:
    """Mirrors WorkspaceMemberModel.add(role='owner', status='active')."""
    now = datetime.utcnow()
    return {
        'workspace_id': workspace_id,
        'user_id': user_id,
        'role': 'owner',
        'invited_by': user_id,
        'invited_email': None,
        'status': 'active',
        'joined_at': now,
        'created_at': now,
    }


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def migrate(db, dry_run: bool = False) -> dict:
    counts = {
        'users_migrated': 0,
        'users_skipped': 0,
        'workspaces_created': 0,
        'members_created': 0,
    }

    cursor = db.users.find({
        '$or': [
            {'active_workspace_id': {'$exists': False}},
            {'active_workspace_id': None},
        ]
    })

    for user in cursor:
        user_id = user['_id']
        email = user.get('email') or ''
        profile = user.get('profile') or {}
        display_name = (profile.get('display_name') or '').strip()
        if not display_name:
            display_name = email.split('@')[0] if email else 'User'

        # If user already has a personal workspace, just reuse it.
        existing_ws = db.workspaces.find_one({
            'owner_id': user_id,
            'type': 'personal',
        })

        if existing_ws:
            ws_id = existing_ws['_id']
            ws_created = False
        else:
            ws_doc = _build_workspace_doc(user_id, display_name)
            slug_base = _slugify(ws_doc['name'])
            slug_candidate = _unique_personal_slug(db, slug_base, user_id) if not dry_run else slug_base
            ws_doc['slug'] = slug_candidate
            if dry_run:
                ws_id = ObjectId()  # placeholder so member-doc assembly still works
                print(
                    f"[dry-run] would create workspace for user_id={user_id} "
                    f"display_name={display_name!r} slug={slug_candidate}"
                )
            else:
                ws_id = db.workspaces.insert_one(ws_doc).inserted_id
            counts['workspaces_created'] += 1
            ws_created = True

        # Ensure owner membership row.
        existing_member = db.workspace_members.find_one({
            'workspace_id': ws_id,
            'user_id': user_id,
        })

        if not existing_member:
            member_doc = _build_member_doc(ws_id, user_id)
            if dry_run:
                print(
                    f"[dry-run] would add owner membership user_id={user_id} "
                    f"workspace_id={ws_id} (created_with_workspace={ws_created})"
                )
            else:
                db.workspace_members.insert_one(member_doc)
            counts['members_created'] += 1

        # Set active_workspace_id on the user.
        if dry_run:
            print(
                f"[dry-run] would set users.active_workspace_id={ws_id} "
                f"for user_id={user_id} email={email!r}"
            )
        else:
            db.users.update_one(
                {'_id': user_id},
                {'$set': {
                    'active_workspace_id': ws_id,
                    'updated_at': datetime.utcnow(),
                }}
            )

        counts['users_migrated'] += 1

    # users_skipped is a delta: users we visited but didn't have to change.
    # With our filter (active_workspace_id missing/null) every iterated user
    # needs at least the pointer update, so this stays at 0 unless the
    # query is widened. Kept for spec parity + future-proofing.
    return counts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill personal workspaces for legacy users.',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing to the database.',
    )
    args = parser.parse_args()

    try:
        db = get_db()
    except Exception as exc:
        print(f"Failed to connect to MongoDB: {exc}")
        sys.exit(1)

    print(f"Connected to {db.name}")
    if args.dry_run:
        print('DRY RUN — no writes will be performed.')

    counts = migrate(db, dry_run=args.dry_run)

    print('\n' + '=' * 40)
    print(f"users_migrated:      {counts['users_migrated']}")
    print(f"users_skipped:       {counts['users_skipped']}")
    print(f"workspaces_created:  {counts['workspaces_created']}")
    print(f"members_created:     {counts['members_created']}")
    print('=' * 40)


if __name__ == '__main__':
    main()
