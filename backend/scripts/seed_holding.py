"""
Holding-company seeder for the new role model (CEO + managers + companies).

Seeds a realistic medium-sized software holding "Acme Holding" with:
  - 1 CEO  (user.role = 'admin')
  - 3 Managers (user.role = 'manager'), one per company
  - 20 employees (user.role = 'user')
  - 3 company workspaces (Engineering, Design, Operations)
  - 6 projects per company (1-2 pinned, 1 archived)
  - 3 groups per company + project group-access grants
  - Sample conversations + messages on active projects
  - 1 pending invite per company
  - Audit-log entries per company

Idempotent. Uses ONLY the new role enum (owner | editor | viewer).

Usage:
    cd backend
    ./.venv-uv/Scripts/python.exe scripts/seed_holding.py            # additive
    ./.venv-uv/Scripts/python.exe scripts/seed_holding.py --reset    # wipe + reseed
    ./.venv-uv/Scripts/python.exe scripts/seed_holding.py --wipe     # wipe only
"""
import argparse
import os
import random
import sys
from datetime import datetime, timedelta

from dotenv import load_dotenv

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(ROOT, '.env'), override=True)
sys.path.insert(0, ROOT)

from app import create_app  # noqa: E402
from app.extensions import mongo  # noqa: E402
from app.models.user import UserModel  # noqa: E402
from app.models.workspace import WorkspaceModel  # noqa: E402
from app.models.workspace_member import WorkspaceMemberModel  # noqa: E402
from app.models.workspace_invite import WorkspaceInviteModel  # noqa: E402
from app.models.project import ProjectModel  # noqa: E402
from app.models.project_member import ProjectMemberModel  # noqa: E402
from app.models.group import GroupModel  # noqa: E402
from app.models.group_member import GroupMemberModel  # noqa: E402
from app.models.project_group_access import ProjectGroupAccessModel  # noqa: E402
from app.models.audit_log import AuditLogModel  # noqa: E402
from app.models.conversation import ConversationModel  # noqa: E402
from app.models.message import MessageModel  # noqa: E402


DOMAIN = 'acme-holding.com'
DEMO_PASSWORD = 'Demo!Pass123'

# -----------------------------------------------------------------------------
# Cast
# -----------------------------------------------------------------------------

CEO = {
    'email': f'ceo@{DOMAIN}',
    'name':  'Sarah Chen',
    'role':  'admin',
}

MANAGERS = [
    {'email': f'eng-director@{DOMAIN}',  'name': 'Marcus Rivera', 'role': 'manager', 'company': 'engineering'},
    {'email': f'design-lead@{DOMAIN}',   'name': 'Amelia Park',   'role': 'manager', 'company': 'design'},
    {'email': f'ops-manager@{DOMAIN}',   'name': 'David Cohen',   'role': 'manager', 'company': 'operations'},
]

EMPLOYEES = [
    # Engineering (8)
    {'email': f'alex.kumar@{DOMAIN}',   'name': 'Alex Kumar',     'company': 'engineering', 'group': 'Backend',   'ws_role': 'editor'},
    {'email': f'jamie.lee@{DOMAIN}',    'name': 'Jamie Lee',      'company': 'engineering', 'group': 'Backend',   'ws_role': 'editor'},
    {'email': f'tom.nguyen@{DOMAIN}',   'name': 'Tom Nguyen',     'company': 'engineering', 'group': 'Frontend',  'ws_role': 'editor'},
    {'email': f'lisa.brown@{DOMAIN}',   'name': 'Lisa Brown',     'company': 'engineering', 'group': 'Frontend',  'ws_role': 'editor'},
    {'email': f'chris.wong@{DOMAIN}',   'name': 'Chris Wong',     'company': 'engineering', 'group': 'Platform',  'ws_role': 'editor'},
    {'email': f'emma.davis@{DOMAIN}',   'name': 'Emma Davis',     'company': 'engineering', 'group': 'Platform',  'ws_role': 'editor'},
    {'email': f'nina.patel@{DOMAIN}',   'name': 'Nina Patel',     'company': 'engineering', 'group': 'Backend',   'ws_role': 'viewer'},
    {'email': f'oscar.kim@{DOMAIN}',    'name': 'Oscar Kim',      'company': 'engineering', 'group': 'Frontend',  'ws_role': 'viewer'},

    # Design (6)
    {'email': f'mia.garcia@{DOMAIN}',   'name': 'Mia Garcia',     'company': 'design', 'group': 'Visual', 'ws_role': 'editor'},
    {'email': f'ben.taylor@{DOMAIN}',   'name': 'Ben Taylor',     'company': 'design', 'group': 'Visual', 'ws_role': 'editor'},
    {'email': f'sara.ito@{DOMAIN}',     'name': 'Sara Ito',       'company': 'design', 'group': 'UX',     'ws_role': 'editor'},
    {'email': f'leo.silva@{DOMAIN}',    'name': 'Leo Silva',      'company': 'design', 'group': 'UX',     'ws_role': 'editor'},
    {'email': f'ivy.zhang@{DOMAIN}',    'name': 'Ivy Zhang',      'company': 'design', 'group': 'Brand',  'ws_role': 'editor'},
    {'email': f'max.holm@{DOMAIN}',     'name': 'Max Holm',       'company': 'design', 'group': 'Brand',  'ws_role': 'viewer'},

    # Operations (6)
    {'email': f'amy.hr@{DOMAIN}',       'name': 'Amy Sanders',    'company': 'operations', 'group': 'HR',                'ws_role': 'editor'},
    {'email': f'ravi.hr@{DOMAIN}',      'name': 'Ravi Sharma',    'company': 'operations', 'group': 'HR',                'ws_role': 'editor'},
    {'email': f'olga.fin@{DOMAIN}',     'name': 'Olga Petrov',    'company': 'operations', 'group': 'Finance',           'ws_role': 'editor'},
    {'email': f'peter.fin@{DOMAIN}',    'name': 'Peter Lopez',    'company': 'operations', 'group': 'Finance',           'ws_role': 'editor'},
    {'email': f'julia.cs@{DOMAIN}',     'name': 'Julia Webb',     'company': 'operations', 'group': 'Customer Success',  'ws_role': 'editor'},
    {'email': f'mark.cs@{DOMAIN}',      'name': 'Mark Reilly',    'company': 'operations', 'group': 'Customer Success',  'ws_role': 'viewer'},
]

COMPANIES = {
    'engineering': {
        'name': 'Acme Engineering',
        'slug': 'acme-engineering',
        'manager_email': f'eng-director@{DOMAIN}',
        'groups': [
            {'name': 'Backend',  'color': '#5c9aed', 'icon': 'cpu',     'description': 'API + services.'},
            {'name': 'Frontend', 'color': '#a78bfa', 'icon': 'sparkle', 'description': 'Web + mobile UI.'},
            {'name': 'Platform', 'color': '#10b981', 'icon': 'database','description': 'DevOps + infra.'},
        ],
        'projects': [
            {'slug': 'api-platform',    'name': 'API Platform',     'desc': 'Public REST + GraphQL gateway',           'color': '#5c9aed', 'icon': 'cpu',       'pinned': True,  'archived': False, 'tags': ['backend', 'platform'], 'group': 'Backend'},
            {'slug': 'mobile-app',      'name': 'Mobile App',       'desc': 'iOS + Android client',                    'color': '#a78bfa', 'icon': 'smartphone','pinned': True,  'archived': False, 'tags': ['mobile'],              'group': 'Frontend'},
            {'slug': 'devops-pipeline', 'name': 'DevOps Pipeline',  'desc': 'CI/CD + observability',                   'color': '#10b981', 'icon': 'gitBranch', 'pinned': False, 'archived': False, 'tags': ['ci', 'infra'],         'group': 'Platform'},
            {'slug': 'internal-tools',  'name': 'Internal Tools',   'desc': 'Admin dashboards + scripts',              'color': '#06b6d4', 'icon': 'wrench',    'pinned': False, 'archived': False, 'tags': ['internal'],            'group': 'Platform'},
            {'slug': 'auth-refactor',   'name': 'Auth Refactor',    'desc': 'OIDC migration + session redesign',       'color': '#f59e0b', 'icon': 'shield',    'pinned': False, 'archived': False, 'tags': ['security'],            'group': 'Backend'},
            {'slug': 'legacy-v2',       'name': 'Legacy v2',        'desc': 'Old monolith — kept for reference',       'color': '#71717a', 'icon': 'archive',   'pinned': False, 'archived': True,  'tags': ['archive'],             'group': 'Backend'},
        ],
        'project_group_access': {
            'api-platform':    [('Backend', 'editor'), ('Platform', 'viewer')],
            'mobile-app':      [('Frontend', 'editor'), ('Backend', 'viewer')],
            'devops-pipeline': [('Platform', 'editor')],
            'internal-tools':  [('Platform', 'editor'), ('Backend', 'viewer')],
            'auth-refactor':   [('Backend', 'editor')],
        },
    },
    'design': {
        'name': 'Acme Design',
        'slug': 'acme-design',
        'manager_email': f'design-lead@{DOMAIN}',
        'groups': [
            {'name': 'Visual', 'color': '#ec4899', 'icon': 'image',   'description': 'Visual + illustration.'},
            {'name': 'UX',     'color': '#a78bfa', 'icon': 'compass', 'description': 'User research + flows.'},
            {'name': 'Brand',  'color': '#f59e0b', 'icon': 'flame',   'description': 'Brand voice + identity.'},
        ],
        'projects': [
            {'slug': 'brand-refresh-2026', 'name': 'Brand Refresh 2026', 'desc': 'Identity + voice update',         'color': '#f59e0b', 'icon': 'flame',    'pinned': True,  'archived': False, 'tags': ['brand'],         'group': 'Brand'},
            {'slug': 'marketing-site-v3',  'name': 'Marketing Site v3',  'desc': 'New marketing site redesign',     'color': '#ec4899', 'icon': 'globe',    'pinned': True,  'archived': False, 'tags': ['web'],           'group': 'Visual'},
            {'slug': 'mobile-ux',          'name': 'Mobile UX',          'desc': 'Mobile app redesign',             'color': '#a78bfa', 'icon': 'compass',  'pinned': False, 'archived': False, 'tags': ['mobile', 'ux'],  'group': 'UX'},
            {'slug': 'design-system',      'name': 'Design System',      'desc': 'Component library + tokens',      'color': '#5c9aed', 'icon': 'package',  'pinned': False, 'archived': False, 'tags': ['system'],        'group': 'UX'},
            {'slug': 'icon-library',       'name': 'Icon Library',       'desc': 'Internal icon set',               'color': '#06b6d4', 'icon': 'sparkle',  'pinned': False, 'archived': False, 'tags': ['icons'],         'group': 'Visual'},
            {'slug': '2024-archive',       'name': '2024 Archive',       'desc': 'Old work — kept for reference',   'color': '#71717a', 'icon': 'archive',  'pinned': False, 'archived': True,  'tags': ['archive'],       'group': 'Brand'},
        ],
        'project_group_access': {
            'brand-refresh-2026': [('Brand', 'editor'), ('Visual', 'viewer')],
            'marketing-site-v3':  [('Visual', 'editor'), ('Brand', 'viewer')],
            'mobile-ux':          [('UX', 'editor')],
            'design-system':      [('UX', 'editor'), ('Visual', 'editor')],
            'icon-library':       [('Visual', 'editor')],
        },
    },
    'operations': {
        'name': 'Acme Operations',
        'slug': 'acme-operations',
        'manager_email': f'ops-manager@{DOMAIN}',
        'groups': [
            {'name': 'HR',                'color': '#10b981', 'icon': 'users',    'description': 'People + culture.'},
            {'name': 'Finance',           'color': '#5c9aed', 'icon': 'database', 'description': 'Books + budget.'},
            {'name': 'Customer Success',  'color': '#ec4899', 'icon': 'message',  'description': 'Onboarding + support.'},
        ],
        'projects': [
            {'slug': 'hr-onboarding',       'name': 'HR Onboarding',       'desc': 'New-hire workflow + checklists',     'color': '#10b981', 'icon': 'flag',     'pinned': True,  'archived': False, 'tags': ['hr'],          'group': 'HR'},
            {'slug': 'vendor-portal',       'name': 'Vendor Portal',       'desc': 'Vendor onboarding + ACH',            'color': '#5c9aed', 'icon': 'package',  'pinned': True,  'archived': False, 'tags': ['vendor'],      'group': 'Finance'},
            {'slug': 'analytics-dashboard', 'name': 'Analytics Dashboard', 'desc': 'Exec metrics + financial KPIs',      'color': '#a78bfa', 'icon': 'database', 'pinned': False, 'archived': False, 'tags': ['analytics'],   'group': 'Finance'},
            {'slug': 'compliance-tracker',  'name': 'Compliance Tracker',  'desc': 'SOC2 + GDPR evidence',               'color': '#f59e0b', 'icon': 'shield',   'pinned': False, 'archived': False, 'tags': ['compliance'],  'group': 'HR'},
            {'slug': 'knowledge-base',      'name': 'Knowledge Base',      'desc': 'Customer FAQ + runbooks',            'color': '#06b6d4', 'icon': 'message',  'pinned': False, 'archived': False, 'tags': ['cs', 'kb'],    'group': 'Customer Success'},
            {'slug': 'old-vendor',          'name': 'Old Vendor',          'desc': 'Sunset relationship — archived',     'color': '#71717a', 'icon': 'archive',  'pinned': False, 'archived': True,  'tags': ['archive'],     'group': 'Finance'},
        ],
        'project_group_access': {
            'hr-onboarding':       [('HR', 'editor')],
            'vendor-portal':       [('Finance', 'editor')],
            'analytics-dashboard': [('Finance', 'editor'), ('HR', 'viewer')],
            'compliance-tracker':  [('HR', 'editor'), ('Finance', 'viewer')],
            'knowledge-base':      [('Customer Success', 'editor')],
        },
    },
}

PENDING_INVITES = {
    'engineering': {'email': f'newhire.eng@{DOMAIN}', 'role': 'editor'},
    'design':      {'email': f'newhire.design@{DOMAIN}', 'role': 'editor'},
    'operations':  {'email': f'newhire.ops@{DOMAIN}', 'role': 'viewer'},
}

SAMPLE_PROMPTS = [
    'Draft the launch announcement.',
    'Summarize the latest customer feedback.',
    'Outline the architecture for the new service.',
    'Critique this blog draft.',
    'Generate three campaign ideas.',
    'What objections come up most often?',
    'Help plan an onboarding sequence.',
    'Translate this paragraph into plain English.',
]
SAMPLE_REPLIES = [
    "Here's a draft. Three sections so you can swap pieces independently.",
    "Top three themes: pricing, integration timelines, and reliability concerns.",
    "Sketching service-A on Postgres + Redis, behind the existing API gateway.",
    "Tone reads stiff in para 2 — loosen up and drop the buzzwords.",
    "Three angles: outcome-led, story-led, and POV-led campaigns.",
    "Most-asked: data residency, seat pricing >500, custom SSO.",
    "Day-1 setup, week-1 paired-coding, week-2 first PR, week-3 retro.",
    "Means: liability is capped at 12× monthly fee, max $50k.",
]

MODEL_IDS = [
    'openai/gpt-4o',
    'anthropic/claude-sonnet-4.5',
    'google/gemini-3-flash-preview',
    'x-ai/grok-4.1-fast',
]


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------

def log(msg):
    try:
        print(f'[seed-holding] {msg}', flush=True)
    except UnicodeEncodeError:
        print(f'[seed-holding] {msg.encode("ascii", "replace").decode("ascii")}', flush=True)


def upsert_user(email: str, name: str, role: str = 'user') -> dict:
    existing = UserModel.find_by_email(email)
    if existing:
        if existing.get('role') != role:
            UserModel.set_role(existing['_id'], role)
            existing = UserModel.find_by_email(email)
        return existing
    UserModel.create(email, DEMO_PASSWORD, name, role=role)
    return UserModel.find_by_email(email)


def find_workspace_by_slug(slug: str):
    return mongo.db[WorkspaceModel.collection_name].find_one({'slug': slug})


def find_project_by_slug(workspace_id, slug: str):
    return mongo.db[ProjectModel.collection_name].find_one({
        'workspace_id': workspace_id,
        'slug': slug,
    })


def find_group_by_name(workspace_id, name: str):
    return mongo.db[GroupModel.collection_name].find_one({
        'workspace_id': workspace_id,
        'name': name,
    })


def upsert_membership(workspace_id, user_id, role: str, invited_by, email: str) -> None:
    """Idempotent: forces row + role + status=active."""
    WorkspaceMemberModel.add(
        workspace_id, user_id, role,
        invited_by=invited_by,
        invited_email=email,
        status='active',
    )
    mongo.db[WorkspaceMemberModel.collection_name].update_one(
        {'workspace_id': workspace_id, 'user_id': user_id},
        {'$set': {'role': role, 'status': 'active'}},
    )


# -----------------------------------------------------------------------------
# Seed steps
# -----------------------------------------------------------------------------

def seed_users():
    log('seeding users…')
    by_email = {}
    by_email[CEO['email']] = upsert_user(CEO['email'], CEO['name'], CEO['role'])
    for m in MANAGERS:
        by_email[m['email']] = upsert_user(m['email'], m['name'], m['role'])
    for e in EMPLOYEES:
        by_email[e['email']] = upsert_user(e['email'], e['name'], 'user')
    log(f'  -> {len(by_email)} users (1 CEO + {len(MANAGERS)} managers + {len(EMPLOYEES)} employees)')
    return by_email


def seed_company(company_key: str, users_by_email: dict):
    spec = COMPANIES[company_key]
    log(f'seeding company "{spec["name"]}"…')

    manager = users_by_email[spec['manager_email']]
    ceo = users_by_email[CEO['email']]

    # Workspace
    ws = find_workspace_by_slug(spec['slug'])
    if not ws:
        WorkspaceModel.create(spec['name'], manager['_id'], type='team')
        ws = find_workspace_by_slug(spec['slug'])
    mongo.db[WorkspaceModel.collection_name].update_one(
        {'_id': ws['_id']},
        {'$set': {
            'domain': DOMAIN,
            'plan_tier': 'business',
            'updated_at': datetime.utcnow(),
        }},
    )
    ws = find_workspace_by_slug(spec['slug'])

    # Memberships: manager owns; CEO viewer; employees per spec
    upsert_membership(ws['_id'], manager['_id'], 'owner', manager['_id'], spec['manager_email'])
    upsert_membership(ws['_id'], ceo['_id'], 'viewer', manager['_id'], CEO['email'])
    for e in EMPLOYEES:
        if e['company'] != company_key:
            continue
        user = users_by_email[e['email']]
        upsert_membership(ws['_id'], user['_id'], e['ws_role'], manager['_id'], e['email'])
        # Set active workspace so demo users land in their company
        mongo.db[UserModel.collection_name].update_one(
            {'_id': user['_id']},
            {'$set': {'active_workspace_id': ws['_id']}},
        )

    # Groups
    groups_by_name = {}
    for g in spec['groups']:
        existing = find_group_by_name(ws['_id'], g['name'])
        if existing:
            groups_by_name[g['name']] = existing
            continue
        try:
            doc = GroupModel.create(
                workspace_id=ws['_id'],
                name=g['name'],
                created_by=manager['_id'],
                color=g['color'],
                icon=g['icon'],
                description=g['description'],
            )
            groups_by_name[g['name']] = doc
        except Exception as exc:
            log(f'    ! skip group {g["name"]}: {exc}')
    for e in EMPLOYEES:
        if e['company'] != company_key:
            continue
        group = groups_by_name.get(e['group'])
        if not group:
            continue
        user = users_by_email[e['email']]
        GroupMemberModel.add(group['_id'], user['_id'], manager['_id'])
    for g in groups_by_name.values():
        try:
            GroupModel.recompute_member_count(g['_id'])
        except Exception:
            pass

    # Projects
    company_employees = [e for e in EMPLOYEES if e['company'] == company_key]
    projects_by_slug = {}
    for p in spec['projects']:
        existing = find_project_by_slug(ws['_id'], p['slug'])
        if existing:
            project = existing
        else:
            project = ProjectModel.create(
                workspace_id=ws['_id'],
                name=p['name'],
                created_by=manager['_id'],
                color=p['color'],
                icon=p['icon'],
                description=p['desc'],
            )
        mongo.db[ProjectModel.collection_name].update_one(
            {'_id': project['_id']},
            {'$set': {
                'pinned':           p['pinned'],
                'archived':         p['archived'],
                'tags':             p['tags'],
                'group':            p['group'],
                'last_activity_at': datetime.utcnow() - timedelta(minutes=random.randint(5, 4320)),
                'updated_at':       datetime.utcnow(),
            }},
        )
        project = mongo.db[ProjectModel.collection_name].find_one({'_id': project['_id']})
        projects_by_slug[p['slug']] = project

        # Manager is implicit owner via workspace fallback — no explicit project owner.
        # Add 1-3 explicit editor members from the company.
        sample = random.sample(company_employees, k=min(3, len(company_employees)))
        for emp in sample:
            user = users_by_email[emp['email']]
            ProjectMemberModel.add(
                project['_id'], user['_id'],
                emp['ws_role'] if emp['ws_role'] in ('editor', 'viewer') else 'editor',
                added_by=manager['_id'],
            )

    # Group access on projects
    for slug, grants in spec['project_group_access'].items():
        project = projects_by_slug.get(slug)
        if not project:
            continue
        for group_name, role in grants:
            group = groups_by_name.get(group_name)
            if not group:
                continue
            ProjectGroupAccessModel.set(
                project['_id'], group['_id'], role,
                created_by=manager['_id'],
            )

    # Pending invite (so the Pending Invites UI has something to show)
    invite_spec = PENDING_INVITES.get(company_key)
    if invite_spec:
        existing_invite = mongo.db[WorkspaceInviteModel.collection_name].find_one({
            'workspace_id': ws['_id'],
            'email': invite_spec['email'],
            'accepted_at': None,
        })
        if not existing_invite:
            try:
                WorkspaceInviteModel.create(
                    ws['_id'], invite_spec['email'], invite_spec['role'], manager['_id'],
                )
            except Exception as exc:
                log(f'    ! skip invite {invite_spec["email"]}: {exc}')

    # Conversations + messages on non-archived projects
    msg_count = 0
    employee_users = [users_by_email[e['email']] for e in company_employees]
    for project in projects_by_slug.values():
        if project.get('archived'):
            continue
        n_convs = random.randint(1, 3)
        for _ in range(n_convs):
            actor = random.choice(employee_users + [manager])
            conv = ConversationModel.create(
                user_id=actor['_id'],
                config_id=None,
                title=random.choice([
                    f"{project['name']} planning",
                    f"Notes — {project['name']}",
                    f"{project['name']} review",
                ]),
                project_id=project['_id'],
            )
            mongo.db[ConversationModel.collection_name].update_one(
                {'_id': conv['_id']},
                {'$set': {
                    'created_at':      datetime.utcnow() - timedelta(days=random.randint(0, 14)),
                    'last_message_at': datetime.utcnow() - timedelta(minutes=random.randint(2, 7200)),
                }},
            )
            for _ in range(random.randint(2, 4)):
                MessageModel.create_user_message(conv['_id'], random.choice(SAMPLE_PROMPTS))
                MessageModel.create_assistant_message(
                    conv['_id'],
                    random.choice(SAMPLE_REPLIES),
                    model_id=random.choice(MODEL_IDS),
                )
                msg_count += 2

    # Audit log entries
    for action, target in [
        ('workspace_create',     spec['name']),
        ('member_invited',       invite_spec['email'] if invite_spec else 'newhire'),
        ('project_created',      spec['projects'][0]['name']),
        ('project_pinned',       spec['projects'][0]['name']),
        ('project_archived',     spec['projects'][-1]['name']),
        ('group_created',        spec['groups'][0]['name']),
    ]:
        try:
            AuditLogModel.create(
                workspace_id=ws['_id'],
                actor_user_id=manager['_id'],
                action=action,
                target=target,
            )
        except Exception:
            pass

    log(f'  -> {len(spec["projects"])} projects, {len(groups_by_name)} groups, '
        f'{len(company_employees)} employees, {msg_count} messages')
    return ws


def seed_holding():
    users = seed_users()
    for company_key in COMPANIES.keys():
        seed_company(company_key, users)


# -----------------------------------------------------------------------------
# Wipe
# -----------------------------------------------------------------------------

def wipe_holding():
    log('wiping holding data…')

    workspace_slugs = [c['slug'] for c in COMPANIES.values()]
    workspaces = list(mongo.db[WorkspaceModel.collection_name].find({'slug': {'$in': workspace_slugs}}))
    workspace_ids = [w['_id'] for w in workspaces]

    project_ids = []
    if workspace_ids:
        projects = list(mongo.db[ProjectModel.collection_name].find({'workspace_id': {'$in': workspace_ids}}))
        project_ids = [p['_id'] for p in projects]

    convs = []
    if project_ids:
        convs = list(mongo.db[ConversationModel.collection_name].find({'project_id': {'$in': project_ids}}))
    conv_ids = [c['_id'] for c in convs]

    if conv_ids:
        mongo.db[MessageModel.collection_name].delete_many({'conversation_id': {'$in': conv_ids}})
        mongo.db[ConversationModel.collection_name].delete_many({'_id': {'$in': conv_ids}})
    if project_ids:
        mongo.db[ProjectMemberModel.collection_name].delete_many({'project_id': {'$in': project_ids}})
        mongo.db['project_group_access'].delete_many({'project_id': {'$in': project_ids}})
        mongo.db[ProjectModel.collection_name].delete_many({'_id': {'$in': project_ids}})
    if workspace_ids:
        mongo.db[WorkspaceMemberModel.collection_name].delete_many({'workspace_id': {'$in': workspace_ids}})
        mongo.db[WorkspaceInviteModel.collection_name].delete_many({'workspace_id': {'$in': workspace_ids}})
        mongo.db[GroupMemberModel.collection_name].delete_many({})  # narrow below
        mongo.db['group_members'].delete_many({})  # safety
        mongo.db[GroupModel.collection_name].delete_many({'workspace_id': {'$in': workspace_ids}})
        mongo.db['audit_logs'].delete_many({'workspace_id': {'$in': workspace_ids}})
        mongo.db[WorkspaceModel.collection_name].delete_many({'_id': {'$in': workspace_ids}})

    # Demo users + their personal workspaces
    demo_emails = (
        [CEO['email']]
        + [m['email'] for m in MANAGERS]
        + [e['email'] for e in EMPLOYEES]
        + [v['email'] for v in PENDING_INVITES.values()]
    )
    demo_users = list(mongo.db[UserModel.collection_name].find({'email': {'$in': demo_emails}}))
    demo_user_ids = [u['_id'] for u in demo_users]
    if demo_user_ids:
        # Personal workspaces (type='personal' with owner_id matching)
        personal_ws = list(mongo.db[WorkspaceModel.collection_name].find({
            'type': 'personal',
            'owner_id': {'$in': demo_user_ids},
        }))
        personal_ids = [w['_id'] for w in personal_ws]
        if personal_ids:
            mongo.db[WorkspaceMemberModel.collection_name].delete_many({'workspace_id': {'$in': personal_ids}})
            mongo.db[WorkspaceModel.collection_name].delete_many({'_id': {'$in': personal_ids}})
        mongo.db[WorkspaceMemberModel.collection_name].delete_many({'user_id': {'$in': demo_user_ids}})
        mongo.db[UserModel.collection_name].delete_many({'_id': {'$in': demo_user_ids}})

    log('  -> wiped')


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description='Seed Acme Holding demo data.')
    parser.add_argument('--reset', action='store_true', help='Wipe + reseed.')
    parser.add_argument('--wipe',  action='store_true', help='Wipe only.')
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        if args.wipe or args.reset:
            wipe_holding()
        if args.wipe:
            log('done (wipe only).')
            return
        seed_holding()
        log('done.')

        ws_count    = mongo.db[WorkspaceModel.collection_name].count_documents({'slug': {'$in': [c['slug'] for c in COMPANIES.values()]}})
        user_count  = mongo.db[UserModel.collection_name].count_documents({'email': {'$regex': f'@{DOMAIN}$'}})
        proj_count  = mongo.db[ProjectModel.collection_name].count_documents({'workspace_id': {'$in': [w['_id'] for w in mongo.db[WorkspaceModel.collection_name].find({'slug': {'$in': [c['slug'] for c in COMPANIES.values()]}})]}})

        log(f'summary: {user_count} users, {ws_count} companies, {proj_count} projects')
        log(f'login: {CEO["email"]} / {DEMO_PASSWORD}  (CEO)')
        for m in MANAGERS:
            log(f'login: {m["email"]} / {DEMO_PASSWORD}  ({m["name"]} — {m["company"]} manager)')


if __name__ == '__main__':
    main()
