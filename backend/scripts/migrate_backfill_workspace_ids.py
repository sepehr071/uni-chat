"""
Backfill workspace_id (and where possible project_id) on usage_logs rows that
were written before scope tracking was added to generate_image / image routes.

Resolution strategy per row:
  1. Row has conversation_id → look up conversations doc → get project_id →
     look up projects doc → get workspace_id.  Set both fields.
  2. No conversation_id → look up user by user_id → get active_workspace_id.
     Set workspace_id only; leave project_id null.
  3. Neither path resolves → skip, counted as "unresolved".

Idempotent: rows that already have workspace_id are skipped.

Usage:
    python scripts/migrate_backfill_workspace_ids.py --dry-run      # preview (default)
    python scripts/migrate_backfill_workspace_ids.py                 # apply changes
    python scripts/migrate_backfill_workspace_ids.py --limit 1000    # test on subset
"""

import argparse
import os
import sys
import time

from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo import UpdateOne

load_dotenv()

BATCH_SIZE = 500
PROGRESS_INTERVAL = 5000


def get_db():
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    return client.get_database()


def _str_to_object_id(value):
    """Return ObjectId if value is a non-empty string, else None."""
    if not value:
        return None
    try:
        return ObjectId(str(value))
    except Exception:
        return None


def run(dry_run: bool, limit: int):
    db = get_db()
    usage_col = db['usage_logs']
    conv_col = db['conversations']
    proj_col = db['projects']
    user_col = db['users']

    query = {'$or': [{'workspace_id': None}, {'workspace_id': {'$exists': False}}]}

    total_cursor = usage_col.count_documents(query)
    if limit:
        total_to_process = min(limit, total_cursor)
    else:
        total_to_process = total_cursor

    print(f"\n=== migrate_backfill_workspace_ids [{'DRY-RUN' if dry_run else 'APPLY'}] ===")
    print(f"Rows missing workspace_id: {total_cursor}")
    if limit:
        print(f"Processing limit: {limit}")
    print()

    cursor = usage_col.find(query, no_cursor_timeout=False)
    if limit:
        cursor = cursor.limit(limit)

    scanned = 0
    updated_via_conv = 0
    updated_via_user = 0
    skipped_unresolved = 0
    skipped_no_user_id = 0

    batch: list[UpdateOne] = []

    start = time.time()

    for row in cursor:
        scanned += 1

        if scanned % PROGRESS_INTERVAL == 0:
            elapsed = time.time() - start
            print(f"  Progress: {scanned}/{total_to_process} scanned, "
                  f"{updated_via_conv + updated_via_user} resolved, "
                  f"{skipped_unresolved} unresolved  ({elapsed:.1f}s)")

        row_id = row['_id']
        user_id = row.get('user_id')

        # --- Path 1: conversation_id present ---
        conv_id_raw = row.get('conversation_id')
        conv_oid = _str_to_object_id(conv_id_raw)
        resolved = False

        if conv_oid:
            conv = conv_col.find_one({'_id': conv_oid}, {'project_id': 1, 'workspace_id': 1})
            if conv:
                workspace_id = None
                project_id = None

                # Some conversations may already carry workspace_id directly
                if conv.get('workspace_id'):
                    workspace_id = str(conv['workspace_id'])

                proj_id_raw = conv.get('project_id')
                proj_oid = _str_to_object_id(proj_id_raw)
                if proj_oid:
                    project_id = str(proj_oid)
                    if not workspace_id:
                        proj_doc = proj_col.find_one({'_id': proj_oid}, {'workspace_id': 1})
                        if proj_doc and proj_doc.get('workspace_id'):
                            workspace_id = str(proj_doc['workspace_id'])

                if workspace_id:
                    update_fields = {'workspace_id': workspace_id}
                    if project_id:
                        update_fields['project_id'] = project_id
                    batch.append(UpdateOne({'_id': row_id}, {'$set': update_fields}))
                    updated_via_conv += 1
                    resolved = True

        # --- Path 2: fall back to user's active_workspace_id ---
        if not resolved:
            user_oid = _str_to_object_id(user_id)
            if user_oid:
                user_doc = user_col.find_one(
                    {'_id': user_oid},
                    {'active_workspace_id': 1}
                )
                if user_doc and user_doc.get('active_workspace_id'):
                    workspace_id = str(user_doc['active_workspace_id'])
                    batch.append(UpdateOne(
                        {'_id': row_id},
                        {'$set': {'workspace_id': workspace_id}}
                    ))
                    updated_via_user += 1
                    resolved = True

        if not resolved:
            if not user_id:
                skipped_no_user_id += 1
            else:
                skipped_unresolved += 1

        # Flush batch
        if len(batch) >= BATCH_SIZE:
            if not dry_run:
                db['usage_logs'].bulk_write(batch, ordered=False)
            batch.clear()

    # Final flush
    if batch and not dry_run:
        db['usage_logs'].bulk_write(batch, ordered=False)

    elapsed = time.time() - start

    print()
    print("=== Results ===")
    print(f"  Rows scanned:                  {scanned}")
    print(f"  Updated via conversation path: {updated_via_conv}")
    print(f"  Updated via user fallback:     {updated_via_user}")
    print(f"  Skipped (unresolved):          {skipped_unresolved}")
    print(f"  Skipped (no user_id):          {skipped_no_user_id}")
    print(f"  Elapsed:                       {elapsed:.2f}s")
    if dry_run:
        print()
        print("Dry-run complete — rerun without --dry-run to apply changes.")
    else:
        total_written = updated_via_conv + updated_via_user
        print(f"  Total rows updated:            {total_written}")


def main():
    parser = argparse.ArgumentParser(
        description='Backfill workspace_id/project_id on usage_logs rows missing scope.'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        default=False,
        help='Count and report changes without writing to MongoDB (default: False)',
    )
    parser.add_argument(
        '--limit',
        type=int,
        default=0,
        metavar='N',
        help='Process at most N rows (0 = unlimited, useful for testing)',
    )
    args = parser.parse_args()

    run(dry_run=args.dry_run, limit=args.limit)


if __name__ == '__main__':
    main()
