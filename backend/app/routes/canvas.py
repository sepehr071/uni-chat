from collections import deque
from datetime import datetime

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_current_user
from app.models.shared_canvas import SharedCanvasModel
from app.utils.helpers import serialize_doc
from app.utils.decorators import active_user_required
from app.utils.feature_required import feature_required

canvas_bp = Blueprint('canvas', __name__)


# Per-IP rate limiter for the public canvas endpoint (P0.11). Pure in-memory
# best-effort guard; same trade-off as `_RATE_LIMIT_WINDOW` in routes/dlp.py.
_PUBLIC_RATE_WINDOW = 60       # seconds
_PUBLIC_RATE_MAX = 30          # GETs per IP per window
_public_get_rate: dict[str, deque] = {}


def _client_ip() -> str:
    fwd = request.headers.get('X-Forwarded-For', '')
    if fwd:
        return fwd.split(',')[0].strip()
    return request.remote_addr or 'unknown'


def _check_public_rate_limit(ip: str):
    now = datetime.utcnow().timestamp()
    window_start = now - _PUBLIC_RATE_WINDOW
    dq = _public_get_rate.setdefault(ip, deque())
    while dq and dq[0] < window_start:
        dq.popleft()
    if len(dq) >= _PUBLIC_RATE_MAX:
        return int(_PUBLIC_RATE_WINDOW - (now - dq[0])) + 1
    dq.append(now)
    return None


# ============================================
# Protected Routes (require authentication)
# ============================================

@canvas_bp.route('/share', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('code_canvas_share')
def share_canvas():
    """Share a canvas publicly"""
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    canvas = SharedCanvasModel.create(
        owner_id=str(user['_id']),
        title=data.get('title', 'Untitled Canvas'),
        html=data.get('html', ''),
        css=data.get('css', ''),
        js=data.get('js', ''),
        visibility=data.get('visibility', 'public')
    )

    return jsonify({
        'canvas': serialize_doc(canvas),
        'share_url': f"/canvas/{canvas['share_id']}"
    }), 201


@canvas_bp.route('/my-canvases', methods=['GET'])
@jwt_required()
@active_user_required
def get_my_canvases():
    """Get user's shared canvases"""
    user = get_current_user()
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 50))
    skip = (page - 1) * limit

    canvases = SharedCanvasModel.find_by_owner(str(user['_id']), skip=skip, limit=limit)
    total = SharedCanvasModel.count_by_owner(str(user['_id']))

    return jsonify({
        'canvases': serialize_doc(canvases),
        'total': total,
        'page': page,
        'limit': limit,
        'has_more': skip + len(canvases) < total
    }), 200


@canvas_bp.route('/<share_id>', methods=['PATCH'])
@jwt_required()
@active_user_required
@feature_required('code_canvas_share')
def update_canvas(share_id):
    """Update a shared canvas"""
    user = get_current_user()
    data = request.get_json(silent=True) or {}

    if not data:
        return jsonify({'error': 'No data provided'}), 400

    # Only allow updating certain fields
    allowed_fields = {'title', 'visibility', 'html', 'css', 'js'}
    update_data = {k: v for k, v in data.items() if k in allowed_fields}

    if not update_data:
        return jsonify({'error': 'No valid fields to update'}), 400

    result = SharedCanvasModel.update(share_id, str(user['_id']), update_data)

    if result.modified_count == 0:
        return jsonify({'error': 'Canvas not found or unauthorized'}), 404

    return jsonify({'message': 'Canvas updated'}), 200


@canvas_bp.route('/<share_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
@feature_required('code_canvas_share')
def delete_canvas(share_id):
    """Delete a shared canvas"""
    user = get_current_user()

    result = SharedCanvasModel.delete(share_id, str(user['_id']))

    if result.deleted_count == 0:
        return jsonify({'error': 'Canvas not found or unauthorized'}), 404

    return jsonify({'message': 'Canvas deleted'}), 200


# ============================================
# Public Routes (no authentication required)
# ============================================

@canvas_bp.route('/public/<share_id>', methods=['GET'])
@feature_required('code_canvas_share')
def get_public_canvas(share_id):
    """Get a publicly shared canvas (no auth required)"""
    retry_after = _check_public_rate_limit(_client_ip())
    if retry_after is not None:
        return jsonify({'error': 'rate_limited', 'retry_after': retry_after}), 429

    canvas = SharedCanvasModel.find_by_share_id(share_id)

    if not canvas:
        return jsonify({'error': 'Canvas not found'}), 404

    # Private canvases are not accessible
    if canvas.get('visibility') == 'private':
        return jsonify({'error': 'Canvas not found'}), 404

    # Increment view count
    SharedCanvasModel.increment_views(share_id)

    # Prepare response (hide owner_id for privacy)
    result = serialize_doc(canvas)
    result.pop('owner_id', None)

    return jsonify({'canvas': result}), 200


@canvas_bp.route('/public/<share_id>/fork', methods=['POST'])
@jwt_required()
@active_user_required
@feature_required('code_canvas_share')
def fork_canvas(share_id):
    """Fork a shared canvas to user's own collection"""
    user = get_current_user()

    original = SharedCanvasModel.find_by_share_id(share_id)

    if not original:
        return jsonify({'error': 'Canvas not found'}), 404

    # Private canvases cannot be forked
    if original.get('visibility') == 'private':
        return jsonify({'error': 'Canvas not found'}), 404

    # Create new canvas with same content
    forked = SharedCanvasModel.create(
        owner_id=str(user['_id']),
        title=f"{original['title']} (fork)",
        html=original['html'],
        css=original['css'],
        js=original['js'],
        visibility='unlisted'  # Start as unlisted
    )

    # Increment fork count on original
    SharedCanvasModel.increment_forks(share_id)

    return jsonify({
        'canvas': serialize_doc(forked),
        'share_url': f"/canvas/{forked['share_id']}"
    }), 201
