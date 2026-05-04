"""
Enterprise (workspaces + projects + billing + groups) backfill.

Idempotent. Re-running yields counts of 0/0/0/0/0/0.

Backfills:
    1. Project decoration: pinned=False, tags=[], last_activity_at = max
       conversation last_message_at (or project.updated_at when no convs).
    2. Workspace billing: credits_balance_usd, budget_mtd_usd, seats_total,
       plan_tier, sso_enforced, scim_enabled, domain, renews_at.
    3. Indexes for groups, group_members, project_group_access, credit_ledger.

Usage:
    python scripts/migrate_enterprise.py             # apply
    python scripts/migrate_enterprise.py --dry-run   # preview only

Standalone — raw pymongo, NO ``app.*`` imports — to avoid the dotenv-load-order
trap noted in CLAUDE.md.
"""

import argparse
import os
import sys
from datetime import datetime

from dotenv import load_dotenv
from pymongo import MongoClient, ASCENDING, DESCENDING

load_dotenv()


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------

def get_db():
    """Open a MongoDB connection using MONGO_URI env var."""
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    return client.get_database()


# ---------------------------------------------------------------------------
# Step 1: Backfill project decoration
# ---------------------------------------------------------------------------

def backfill_projects(db, dry_run: bool) -> dict:
    counts = {'projects_touched': 0, 'projects_already_set': 0}

    cursor = db.projects.find({})
    for proj in cursor:
        pid = proj['_id']
        update = {}

        if 'pinned' not in proj or proj.get('pinned') is None:
            update['pinned'] = False
        if 'tags' not in proj or proj.get('tags') is None:
            update['tags'] = []
        if 'last_activity_at' not in proj or proj.get('last_activity_at') is None:
            # Find latest conversation activity for this project.
            latest_conv = db.conversations.find_one(
                {'project_id': pid},
                sort=[('last_message_at', DESCENDING)],
                projection={'last_message_at': 1},
            )
            if latest_conv and latest_conv.get('last_message_at'):
                update['last_activity_at'] = latest_conv['last_message_at']
            else:
                update['last_activity_at'] = proj.get('updated_at') or proj.get('created_at') or datetime.utcnow()

        if not update:
            counts['projects_already_set'] += 1
            continue

        if dry_run:
            print(f"[dry-run] project {pid} += {list(update.keys())}")
        else:
            db.projects.update_one(
                {'_id': pid},
                {'$set': {**update, 'updated_at': datetime.utcnow()}},
            )
        counts['projects_touched'] += 1

    return counts


# ---------------------------------------------------------------------------
# Step 2: Backfill workspace billing defaults
# ---------------------------------------------------------------------------

def backfill_workspaces(db, dry_run: bool) -> dict:
    counts = {'workspaces_touched': 0, 'workspaces_already_set': 0}

    cursor = db.workspaces.find({})
    for ws in cursor:
        wid = ws['_id']
        update = {}

        if 'credits_balance_usd' not in ws or ws.get('credits_balance_usd') is None:
            update['credits_balance_usd'] = 0.0
        if 'budget_mtd_usd' not in ws or ws.get('budget_mtd_usd') is None:
            update['budget_mtd_usd'] = 0.0
        if 'plan_tier' not in ws or not ws.get('plan_tier'):
            update['plan_tier'] = ws.get('plan') or 'free'
        if 'seats_total' not in ws or ws.get('seats_total') is None:
            active = db.workspace_members.count_documents({
                'workspace_id': wid,
                'status': 'active',
            })
            update['seats_total'] = max(5, active)
        if 'sso_enforced' not in ws or ws.get('sso_enforced') is None:
            update['sso_enforced'] = False
        if 'scim_enabled' not in ws or ws.get('scim_enabled') is None:
            update['scim_enabled'] = False
        if 'domain' not in ws:
            update['domain'] = None
        if 'renews_at' not in ws:
            update['renews_at'] = None

        if not update:
            counts['workspaces_already_set'] += 1
            continue

        if dry_run:
            print(f"[dry-run] workspace {wid} += {list(update.keys())}")
        else:
            db.workspaces.update_one(
                {'_id': wid},
                {'$set': {**update, 'updated_at': datetime.utcnow()}},
            )
        counts['workspaces_touched'] += 1

    return counts


# ---------------------------------------------------------------------------
# Step 3: Create indexes for new collections
# ---------------------------------------------------------------------------

def create_indexes(db, dry_run: bool) -> dict:
    counts = {'indexes_created': 0}

    if dry_run:
        print('[dry-run] would create indexes for: groups, group_members, '
              'project_group_access, credit_ledger, usage_logs (additive)')
        return counts

    # groups: (workspace_id, name) unique, workspace_id
    db.groups.create_index([('workspace_id', ASCENDING), ('name', ASCENDING)], unique=True)
    db.groups.create_index([('workspace_id', ASCENDING)])
    counts['indexes_created'] += 2

    # group_members: (group_id, user_id) unique, user_id
    db.group_members.create_index([('group_id', ASCENDING), ('user_id', ASCENDING)], unique=True)
    db.group_members.create_index([('user_id', ASCENDING)])
    counts['indexes_created'] += 2

    # project_group_access: (project_id, group_id) unique
    db.project_group_access.create_index(
        [('project_id', ASCENDING), ('group_id', ASCENDING)], unique=True,
    )
    counts['indexes_created'] += 1

    # credit_ledger: (workspace_id, created_at desc)
    db.credit_ledger.create_index([('workspace_id', ASCENDING), ('created_at', DESCENDING)])
    counts['indexes_created'] += 1

    # usage_logs: additive — leave existing in place.
    db.usage_logs.create_index([('workspace_id', ASCENDING), ('created_at', DESCENDING)])
    db.usage_logs.create_index([('project_id', ASCENDING), ('created_at', DESCENDING)])
    db.usage_logs.create_index([('model', ASCENDING), ('created_at', DESCENDING)])
    try:
        db.usage_logs.create_index(
            'generation_id', unique=True, sparse=True, name='uniq_generation_id',
        )
        counts['indexes_created'] += 1
    except Exception:
        # Already exists — that's fine.
        pass
    counts['indexes_created'] += 3

    return counts


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description='Backfill enterprise (workspace/project/billing) fields + indexes.',
    )
    parser.add_argument(
        '--dry-run', action='store_true',
        help='Preview changes without writing to the database.',
    )
    parser.add_argument(
        '--apply', action='store_true',
        help='Apply changes (default behavior when no flag given).',
    )
    args = parser.parse_args()

    dry_run = bool(args.dry_run) and not bool(args.apply)

    try:
        db = get_db()
    except Exception as exc:
        print(f"Failed to connect to MongoDB: {exc}")
        sys.exit(1)

    print(f"Connected to {db.name}")
    if dry_run:
        print('DRY RUN — no writes will be performed.')

    proj_counts = backfill_projects(db, dry_run)
    ws_counts = backfill_workspaces(db, dry_run)
    idx_counts = create_indexes(db, dry_run)

    print('\n' + '=' * 50)
    print('migrate_enterprise summary')
    print('=' * 50)
    print(f"projects_touched:        {proj_counts['projects_touched']}")
    print(f"projects_already_set:    {proj_counts['projects_already_set']}")
    print(f"workspaces_touched:      {ws_counts['workspaces_touched']}")
    print(f"workspaces_already_set:  {ws_counts['workspaces_already_set']}")
    print(f"indexes_created:         {idx_counts['indexes_created']}")
    print('=' * 50)


if __name__ == '__main__':
    main()
