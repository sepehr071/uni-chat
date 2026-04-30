"""
Backfill default 'Personal' project for every personal workspace.

For every `workspaces` doc with type='personal' that does NOT already have
a project with slug='personal', this script:
    1. Inserts a new `projects` row with the personal-defaults shape.
    2. Inserts an owner-role row in `project_members` for the workspace owner.

With `--move-personal`, additionally re-points existing `folders` and
`conversations` for that owner that have project_id missing/null to the new
default project. Without the flag, those docs stay unfiled (NULL) and the
UI surfaces them under the "Unfiled" pseudo-bucket.

Idempotent: re-running yields zero new inserts and zero moves.

Usage:
    python scripts/migrate_projects.py                   # apply
    python scripts/migrate_projects.py --dry-run         # preview only
    python scripts/migrate_projects.py --move-personal   # also relocate folders/convs

Standalone — uses raw pymongo, NO `app.*` imports — to avoid the dotenv-
load-order trap noted in CLAUDE.md.
"""

import argparse
import os
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


def _build_project_doc(workspace_id: ObjectId, owner_id: ObjectId) -> dict:
    """Construct the default Personal project doc."""
    now = datetime.utcnow()
    return {
        'workspace_id': workspace_id,
        'name': 'Personal',
        'slug': 'personal',
        'created_by': owner_id,
        'color': '#5c9aed',
        'icon': None,
        'description': None,
        'archived': False,
        'created_at': now,
        'updated_at': now,
    }


def _build_member_doc(project_id: ObjectId, user_id: ObjectId) -> dict:
    now = datetime.utcnow()
    return {
        'project_id': project_id,
        'user_id': user_id,
        'role': 'owner',
        'added_by': user_id,
        'created_at': now,
    }


# ---------------------------------------------------------------------------
# Migration
# ---------------------------------------------------------------------------

def migrate(db, dry_run: bool = False, move_personal: bool = False) -> dict:
    counts = {
        'personal_workspaces_seen': 0,
        'default_projects_created': 0,
        'members_created': 0,
        'folders_moved': 0,
        'conversations_moved': 0,
    }

    cursor = db.workspaces.find({'type': 'personal'})

    for ws in cursor:
        counts['personal_workspaces_seen'] += 1
        ws_id = ws['_id']
        owner_id = ws.get('owner_id')

        if owner_id is None:
            print(f"[skip] personal workspace {ws_id} has no owner_id")
            continue

        # Skip if a project with slug='personal' already exists in this workspace.
        existing = db.projects.find_one({
            'workspace_id': ws_id,
            'slug': 'personal',
        })

        if existing:
            project_id = existing['_id']
            project_created = False
        else:
            doc = _build_project_doc(ws_id, owner_id)
            if dry_run:
                project_id = ObjectId()  # placeholder
                print(
                    f"[dry-run] would create Personal project for "
                    f"workspace_id={ws_id} owner_id={owner_id}"
                )
            else:
                project_id = db.projects.insert_one(doc).inserted_id
            counts['default_projects_created'] += 1
            project_created = True

        # Owner membership row.
        existing_member = db.project_members.find_one({
            'project_id': project_id,
            'user_id': owner_id,
        })
        if not existing_member:
            member_doc = _build_member_doc(project_id, owner_id)
            if dry_run:
                print(
                    f"[dry-run] would add owner membership user_id={owner_id} "
                    f"project_id={project_id} (created_with_project={project_created})"
                )
            else:
                db.project_members.insert_one(member_doc)
            counts['members_created'] += 1

        # Optional: re-point unfiled folders + conversations to this project.
        if move_personal:
            unfiled_filter = {
                'user_id': owner_id,
                '$or': [
                    {'project_id': {'$exists': False}},
                    {'project_id': None},
                ],
            }

            if dry_run:
                folders_n = db.folders.count_documents(unfiled_filter)
                convs_n = db.conversations.count_documents(unfiled_filter)
                print(
                    f"[dry-run] would move folders={folders_n} conversations={convs_n} "
                    f"for owner_id={owner_id} -> project_id={project_id}"
                )
                counts['folders_moved'] += folders_n
                counts['conversations_moved'] += convs_n
            else:
                fres = db.folders.update_many(
                    unfiled_filter,
                    {'$set': {'project_id': project_id, 'updated_at': datetime.utcnow()}},
                )
                cres = db.conversations.update_many(
                    unfiled_filter,
                    {'$set': {'project_id': project_id, 'updated_at': datetime.utcnow()}},
                )
                counts['folders_moved'] += fres.modified_count
                counts['conversations_moved'] += cres.modified_count

    return counts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill default Personal projects for personal workspaces.',
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Preview changes without writing to the database.',
    )
    parser.add_argument(
        '--move-personal',
        action='store_true',
        help='Also re-point unfiled folders+conversations to the new default project.',
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
    if args.move_personal:
        print('Mode: --move-personal (will re-point unfiled docs)')

    counts = migrate(db, dry_run=args.dry_run, move_personal=args.move_personal)

    print('\n' + '=' * 40)
    print(f"personal_workspaces_seen:   {counts['personal_workspaces_seen']}")
    print(f"default_projects_created:   {counts['default_projects_created']}")
    print(f"members_created:            {counts['members_created']}")
    print(f"folders_moved:              {counts['folders_moved']}")
    print(f"conversations_moved:        {counts['conversations_moved']}")
    print('=' * 40)


if __name__ == '__main__':
    main()
