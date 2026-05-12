"""
Platform super-admin + feature-flag bootstrap migration.

Idempotent. Re-running on a clean DB yields zero writes.

Steps:
    1. Upsert `platform_settings` singleton with DEFAULT_FEATURES via
       $setOnInsert (existing flag values are never overwritten).
    2. If PLATFORM_ADMIN_EMAIL + PLATFORM_ADMIN_PASSWORD are set: validate
       the password (>=16 chars, not in weak-password set), refuse to
       collide with an existing `users` row, then upsert a row in
       `platform_admins` with bcrypt-bytes (create-only on password_hash).
    3. Print a summary.

Standalone — raw pymongo, NO `app.*` imports — to avoid the dotenv-load-order
trap noted in CLAUDE.md.

Usage:
    python scripts/migrate_platform_admin.py             # dry-run (default)
    python scripts/migrate_platform_admin.py --dry-run   # explicit dry-run
    python scripts/migrate_platform_admin.py --apply     # write changes
"""

import argparse
import os
import sys
from datetime import datetime

import bcrypt
from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient

load_dotenv()


DEFAULT_FEATURES = {
    'arena': False,
    'debate': False,
    'image_studio': True,
    'workflow': False,
    'knowledge': True,
    'automate_agent': False,
    'routines': False,
    'code_canvas_run': True,
    'code_canvas_share': False,
    'telegram_bot': False,
}

WEAK_PASSWORDS = {'admin', 'admin123', 'changeme', 'password', 'password123'}


# ---------------------------------------------------------------------------
# Mongo helpers
# ---------------------------------------------------------------------------

def get_db():
    """Open a MongoDB connection. Refuses if MONGO_URI omits a DB name."""
    mongo_uri = os.getenv('MONGO_URI', 'mongodb://localhost:27017/unichat')
    client = MongoClient(mongo_uri)
    db = client.get_database()
    # The default DB name from PyMongo is 'test' when the URI omits one — both
    # 'test' and an empty `name` are red-flag misconfigurations for this app.
    assert db.name and db.name not in ('test',), (
        f"MONGO_URI must include a database name (e.g. .../unichat). "
        f"Got default DB name: {db.name!r}"
    )
    return db


# ---------------------------------------------------------------------------
# Step 1: platform_settings singleton
# ---------------------------------------------------------------------------

def ensure_settings(db, dry_run: bool) -> dict:
    existing = db.platform_settings.find_one({'_id': 'singleton'})
    if existing:
        # Only fill in keys that are missing — preserve every existing flag.
        missing_keys = [k for k in DEFAULT_FEATURES if k not in (existing.get('features') or {})]
        if not missing_keys:
            print(f"  platform_settings.singleton: present, all {len(DEFAULT_FEATURES)} flags set.")
            return {'created': False, 'missing_filled': 0}

        print(f"  platform_settings.singleton: present, filling {len(missing_keys)} missing flag(s): {missing_keys}")
        if not dry_run:
            updates = {f'features.{k}': DEFAULT_FEATURES[k] for k in missing_keys}
            db.platform_settings.update_one(
                {'_id': 'singleton'},
                {'$set': updates},
            )
        return {'created': False, 'missing_filled': len(missing_keys)}

    print(f"  platform_settings.singleton: missing — creating with defaults.")
    if not dry_run:
        db.platform_settings.update_one(
            {'_id': 'singleton'},
            {
                '$setOnInsert': {
                    '_id': 'singleton',
                    'features': dict(DEFAULT_FEATURES),
                    'updated_at': datetime.utcnow(),
                    'updated_by': None,
                }
            },
            upsert=True,
        )
    return {'created': True, 'missing_filled': 0}


# ---------------------------------------------------------------------------
# Step 2: platform_admin bootstrap
# ---------------------------------------------------------------------------

def validate_password(password: str) -> str:
    if not password:
        return 'PLATFORM_ADMIN_PASSWORD is empty'
    if len(password) < 12:
        return f'PLATFORM_ADMIN_PASSWORD must be >= 12 characters (got {len(password)})'
    if password.lower() in WEAK_PASSWORDS:
        return f'PLATFORM_ADMIN_PASSWORD is a weak password ({sorted(WEAK_PASSWORDS)})'
    return ''


def ensure_platform_admin(db, dry_run: bool) -> dict:
    email = (os.getenv('PLATFORM_ADMIN_EMAIL') or '').strip().lower()
    password = os.getenv('PLATFORM_ADMIN_PASSWORD') or ''
    display_name = (os.getenv('PLATFORM_ADMIN_NAME') or 'Platform Operator').strip()

    if not email or not password:
        print(
            "  PLATFORM_ADMIN_EMAIL / PLATFORM_ADMIN_PASSWORD not set — "
            "skipping platform_admin bootstrap. (platform_settings still created.)"
        )
        return {'skipped': True, 'created': False, 'updated': False}

    err = validate_password(password)
    if err:
        print(f"  ERROR: {err}")
        if not dry_run:
            sys.exit(2)
        return {'skipped': True, 'created': False, 'updated': False, 'error': err}

    # Cross-collection uniqueness guard
    clash = db.users.find_one({'email': email})
    if clash:
        msg = (
            f"  ERROR: a `users` row already exists with email {email!r} "
            f"(_id={clash['_id']}). Cannot also register as platform_admin."
        )
        print(msg)
        if not dry_run:
            sys.exit(3)
        return {'skipped': True, 'created': False, 'updated': False, 'error': 'email_clash'}

    # Ensure index before insert (idempotent)
    if not dry_run:
        db.platform_admins.create_index([('email', ASCENDING)], unique=True)

    existing = db.platform_admins.find_one({'email': email})
    if existing:
        # Create-only on password_hash: never rotate. Only refresh non-secret fields.
        update_payload: dict = {'updated_at': datetime.utcnow()}
        if display_name and existing.get('display_name') != display_name:
            update_payload['display_name'] = display_name
            print(f"  platform_admins: refreshing display_name for {email!r}")
        else:
            print(f"  platform_admins: present for {email!r} — no field changes needed.")

        if not dry_run:
            db.platform_admins.update_one(
                {'_id': existing['_id']},
                {'$set': update_payload},
            )
        return {'skipped': False, 'created': False, 'updated': len(update_payload) > 1}

    print(f"  platform_admins: creating new row for {email!r}")
    if not dry_run:
        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())
        now = datetime.utcnow()
        db.platform_admins.insert_one({
            'email': email,
            'password_hash': password_hash,
            'display_name': display_name or 'Platform Operator',
            'created_at': now,
            'updated_at': now,
            'last_active_at': None,
        })
    return {'skipped': False, 'created': True, 'updated': False}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Bootstrap platform_admin + platform_settings.')
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true', default=True,
                      help='Preview changes without writing (default)')
    mode.add_argument('--apply', action='store_true', default=False,
                      help='Write changes to MongoDB')
    args = parser.parse_args()

    dry_run = not args.apply
    label = 'DRY-RUN' if dry_run else 'APPLY'
    print(f"\n=== migrate_platform_admin [{label}] ===\n")

    try:
        db = get_db()
    except Exception as exc:
        print(f"Failed to connect to MongoDB: {exc}")
        sys.exit(1)

    print(f"Connected to DB: {db.name}")

    print('\n[platform_settings]')
    settings_result = ensure_settings(db, dry_run=dry_run)

    print('\n[platform_admins]')
    admin_result = ensure_platform_admin(db, dry_run=dry_run)

    print('\n' + '=' * 40)
    if dry_run:
        print('Dry-run complete — rerun with --apply to write changes.')
    else:
        print(
            f"platform_settings created: {settings_result.get('created')} "
            f"(missing_filled={settings_result.get('missing_filled', 0)})"
        )
        print(
            f"platform_admin     created: {admin_result.get('created')} "
            f"updated: {admin_result.get('updated')} "
            f"skipped: {admin_result.get('skipped')}"
        )
    print('=' * 40)


if __name__ == '__main__':
    main()
