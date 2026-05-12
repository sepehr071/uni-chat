from aiogram import Router
from aiogram.filters import Command
from aiogram.types import Message, CallbackQuery
from app.models.user import UserModel
from app.models.conversation import ConversationModel
from app.models.llm_config import LLMConfigModel
from bot.flask_ctx import flask_app
from bot.services.auth import resolve_user, invalidate
from bot.keyboards import model_picker, project_picker

router = Router()

HELP_TEXT = (
    '<b>uni-chat bot</b>\n\n'
    '/new — fresh conversation\n'
    '/model — pick a model\n'
    '/assistant — pick a saved assistant\n'
    '/project — pick an active project\n'
    '/history — recent conversations\n'
    '/unlink — disconnect this account\n'
    '/help — this message\n'
)


def _require_linked(msg: Message):
    user = resolve_user(msg.from_user.id)
    if not user:
        return None
    return user


@router.message(Command('help'))
async def cmd_help(msg: Message):
    await msg.answer(HELP_TEXT)


@router.message(Command('new'))
async def cmd_new(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked. Open uni-chat → Settings → Telegram.')
    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_conversation_id': None})
    invalidate(msg.from_user.id)
    await msg.answer('New conversation. Send a message to begin.')


@router.message(Command('history'))
async def cmd_history(msg: Message):
    """List recent conversations for THIS Telegram link scope.

    P1.18: previously this returned every web-created conversation the user
    owned (including in other projects), making the Telegram /history list
    misleading. Now we restrict to the current Telegram project scope:

    * If the user has ``telegram_active_project_id`` set, only conversations
      with a matching ``project_id`` are shown.
    * Otherwise, only conversations without a ``project_id`` (personal scope)
      are shown.

    This mirrors the scoping that ``services/chat.py`` already uses when the
    bot creates new conversations, so the list now reflects "what this
    Telegram thread can actually see."
    """
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    active_pid = user.get('telegram_active_project_id')
    with flask_app.app_context():
        from app.models.conversation import NULL_PROJECT_SENTINEL
        project_filter = active_pid if active_pid else NULL_PROJECT_SENTINEL
        convos = ConversationModel.find_by_user(
            str(user['_id']),
            limit=10,
            project_id=project_filter,
        )
    if not convos:
        return await msg.answer('No conversations yet.')
    lines = ['<b>Recent conversations</b>']
    for c in convos:
        title = c.get('title') or 'Untitled'
        lines.append(f'• {title} ({c["message_count"]} msgs)')
    await msg.answer('\n'.join(lines))


@router.message(Command('unlink'))
async def cmd_unlink(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Already unlinked.')
    with flask_app.app_context():
        UserModel.clear_telegram_link(str(user['_id']))
    invalidate(msg.from_user.id)
    await msg.answer('Unlinked. /start to relink anytime.')


@router.message(Command('model'))
async def cmd_model(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = LLMConfigModel.find_visible_to(
            str(user['_id']),
            project_id=user.get('telegram_active_project_id'),
            limit=10,
        )
    await msg.answer('Pick a model:', reply_markup=model_picker(assistants))


@router.message(Command('assistant'))
async def cmd_assistant(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        assistants = LLMConfigModel.find_visible_to(
            str(user['_id']),
            project_id=user.get('telegram_active_project_id'),
            limit=10,
        )
    if not assistants:
        return await msg.answer('No saved assistants. Create one in uni-chat web app.')
    await msg.answer('Pick an assistant:', reply_markup=model_picker(assistants[:10]))


@router.message(Command('project'))
async def cmd_project(msg: Message):
    user = _require_linked(msg)
    if not user:
        return await msg.answer('Not linked.')
    with flask_app.app_context():
        from app.models.workspace_member import WorkspaceMemberModel
        from app.models.project import ProjectModel
        from app.models.workspace import WorkspaceModel
        memberships = WorkspaceMemberModel.find_by_user(str(user['_id']), status='active') or []
        projects = []
        ws_name_cache = {}
        for m in memberships:
            wid = str(m['workspace_id'])
            ws = ws_name_cache.get(wid)
            if not ws:
                ws_doc = WorkspaceModel.find_by_id(wid)
                ws = ws_doc.get('name') if ws_doc else None
                ws_name_cache[wid] = ws
            for p in (ProjectModel.find_by_workspace(wid, archived=False) or []):
                projects.append({'_id': str(p['_id']), 'name': p['name'], 'workspace_name': ws})
    active_pid = user.get('telegram_active_project_id')
    prefix = '-- Personal --' if not active_pid else f'project: {active_pid}'
    await msg.answer(
        f'Active scope: {prefix}\nPick a project:',
        reply_markup=project_picker(projects),
    )


@router.callback_query(lambda c: c.data and c.data.startswith('proj:'))
async def on_pick_project(cb: CallbackQuery):
    user = resolve_user(cb.from_user.id)
    if not user:
        return await cb.answer('Not linked.', show_alert=True)
    payload = cb.data[len('proj:'):]

    if payload != 'none':
        try:
            from bson import ObjectId
            from bson.errors import InvalidId
            ObjectId(payload)
        except (InvalidId, TypeError):
            return await cb.answer('Invalid project.', show_alert=True)
        from app.utils.permissions import check_project_access
        with flask_app.app_context():
            allowed = check_project_access(str(user['_id']), payload, 'viewer')
        if not allowed:
            return await cb.answer('Project not in your workspaces.', show_alert=True)

    update = {
        'telegram_active_project_id': None if payload == 'none' else payload,
        # Switching project resets active config to avoid leaking a project-scoped assistant.
        'telegram_active_config_id': None,
        # And starts a fresh conversation so context does not carry across projects.
        'telegram_active_conversation_id': None,
    }
    with flask_app.app_context():
        UserModel.update(str(user['_id']), update)
    invalidate(cb.from_user.id)
    await cb.answer('Set.')
    label = 'Personal' if payload == 'none' else f'project {payload}'
    await cb.message.edit_text(f'Active scope: {label}. New conversation started.')


@router.callback_query(lambda c: c.data and c.data.startswith('cfg:'))
async def on_pick_config(cb: CallbackQuery):
    """Persist the user's pick of model/assistant.

    P1.19: previously this stored ANY ``cfg:<id>`` payload verbatim. A
    crafted callback (e.g. another user's private LLMConfig _id, or a
    deleted/foreign ObjectId) would silently become the active config and
    later resolve at chat time -- cross-user assistant leakage. Now we
    accept three shapes:

    1. ``quick:<openrouter_model_id>`` -- the bot's hardcoded quick-pick
       constants (keyboards.QUICK_MODELS). No DB lookup needed.
    2. ``agent:<id>`` -- routed via app.utils.config_resolver; same
       no-DB-validation treatment as the web client uses today.
    3. A raw ObjectId of a saved LLMConfig -- must be visible to the user
       under their current ``telegram_active_project_id`` per
       ``LLMConfigModel.find_visible_to``. Anything else is rejected.
    """
    user = resolve_user(cb.from_user.id)
    if not user:
        return await cb.answer('Not linked.', show_alert=True)
    cfg_id = cb.data[len('cfg:'):]

    if not (cfg_id.startswith('quick:') or cfg_id.startswith('agent:')):
        # Treat as a saved LLMConfig ObjectId — validate visibility before
        # persisting so users can't bind to someone else's private assistant.
        from bson import ObjectId
        from bson.errors import InvalidId
        try:
            ObjectId(cfg_id)
        except (InvalidId, TypeError):
            return await cb.answer('Invalid config.', show_alert=True)

        active_pid = user.get('telegram_active_project_id')
        with flask_app.app_context():
            visible = LLMConfigModel.find_visible_to(
                str(user['_id']),
                project_id=active_pid,
                limit=200,
            )
            allowed_ids = {str(c['_id']) for c in (visible or [])}
        if cfg_id not in allowed_ids:
            return await cb.answer('Config not accessible.', show_alert=True)

    with flask_app.app_context():
        UserModel.update(str(user['_id']), {'telegram_active_config_id': cfg_id})
    invalidate(cb.from_user.id)
    await cb.answer('Set.')
    await cb.message.edit_text(f'Active model: <code>{cfg_id}</code>')
