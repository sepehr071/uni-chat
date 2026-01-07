import os
import uuid
from datetime import datetime
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_current_user
from werkzeug.utils import secure_filename
from PIL import Image
from app.extensions import mongo
from app.utils.helpers import serialize_doc
from app.utils.decorators import active_user_required
from bson import ObjectId

uploads_bp = Blueprint('uploads', __name__)


def allowed_file(filename):
    """Check if file extension is allowed"""
    allowed = current_app.config.get('ALLOWED_EXTENSIONS', {'png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'txt', 'md'})
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed


def get_upload_folder():
    """Get upload folder path"""
    folder = current_app.config.get('UPLOAD_FOLDER', 'uploads')
    if not os.path.exists(folder):
        os.makedirs(folder)
    return folder


def create_thumbnail(image_path, thumbnail_path, size=(200, 200)):
    """Create thumbnail for image"""
    try:
        with Image.open(image_path) as img:
            img.thumbnail(size)
            img.save(thumbnail_path)
        return True
    except Exception as e:
        print(f"Error creating thumbnail: {e}")
        return False


@uploads_bp.route('/file', methods=['POST'])
@jwt_required()
@active_user_required
def upload_file():
    """Upload a file"""
    user = get_current_user()
    user_id = str(user['_id'])

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    if not allowed_file(file.filename):
        return jsonify({'error': 'File type not allowed'}), 400

    # Generate unique filename
    original_name = secure_filename(file.filename)
    extension = original_name.rsplit('.', 1)[1].lower() if '.' in original_name else ''
    unique_filename = f"{uuid.uuid4().hex}.{extension}"

    # Save file
    upload_folder = get_upload_folder()
    file_path = os.path.join(upload_folder, unique_filename)
    file.save(file_path)

    # Get file size
    file_size = os.path.getsize(file_path)

    # Determine file type
    image_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    file_type = 'image' if extension in image_extensions else 'file'

    # Create thumbnail for images
    thumbnail_filename = None
    if file_type == 'image':
        thumbnail_filename = f"thumb_{unique_filename}"
        thumbnail_path = os.path.join(upload_folder, thumbnail_filename)
        create_thumbnail(file_path, thumbnail_path)

    # Store in database
    upload_doc = {
        'user_id': ObjectId(user_id),
        'filename': unique_filename,
        'original_name': original_name,
        'mime_type': file.content_type,
        'size': file_size,
        'type': file_type,
        'thumbnail_filename': thumbnail_filename,
        'created_at': datetime.utcnow()
    }

    result = mongo.db.uploads.insert_one(upload_doc)
    upload_doc['_id'] = result.inserted_id

    # Build URLs
    base_url = request.host_url.rstrip('/')
    file_url = f"{base_url}/api/uploads/{result.inserted_id}"
    thumbnail_url = f"{base_url}/api/uploads/{result.inserted_id}/thumbnail" if thumbnail_filename else None

    return jsonify({
        'upload': {
            'id': str(result.inserted_id),
            'filename': unique_filename,
            'original_name': original_name,
            'type': file_type,
            'size': file_size,
            'url': file_url,
            'thumbnail_url': thumbnail_url
        }
    }), 201


@uploads_bp.route('/image', methods=['POST'])
@jwt_required()
@active_user_required
def upload_image():
    """Upload an image (with validation)"""
    user = get_current_user()

    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    file = request.files['file']

    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Check if it's an image
    extension = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''
    if extension not in {'png', 'jpg', 'jpeg', 'gif', 'webp'}:
        return jsonify({'error': 'File must be an image'}), 400

    # Use the general upload handler
    return upload_file()


@uploads_bp.route('/<upload_id>', methods=['GET'])
@jwt_required(optional=True)
def get_upload(upload_id):
    """Get/serve an uploaded file - optional auth for access logging"""
    try:
        upload = mongo.db.uploads.find_one({'_id': ObjectId(upload_id)})
    except Exception:
        return jsonify({'error': 'Invalid upload ID'}), 400

    if not upload:
        return jsonify({'error': 'Upload not found'}), 404

    upload_folder = get_upload_folder()
    return send_from_directory(upload_folder, upload['filename'])


@uploads_bp.route('/<upload_id>/thumbnail', methods=['GET'])
@jwt_required(optional=True)
def get_thumbnail(upload_id):
    """Get thumbnail for an uploaded image - optional auth for access logging"""
    try:
        upload = mongo.db.uploads.find_one({'_id': ObjectId(upload_id)})
    except Exception:
        return jsonify({'error': 'Invalid upload ID'}), 400

    if not upload:
        return jsonify({'error': 'Upload not found'}), 404

    if not upload.get('thumbnail_filename'):
        return jsonify({'error': 'No thumbnail available'}), 404

    upload_folder = get_upload_folder()
    return send_from_directory(upload_folder, upload['thumbnail_filename'])


@uploads_bp.route('/<upload_id>', methods=['DELETE'])
@jwt_required()
@active_user_required
def delete_upload(upload_id):
    """Delete an uploaded file"""
    user = get_current_user()
    user_id = str(user['_id'])

    try:
        upload = mongo.db.uploads.find_one({'_id': ObjectId(upload_id)})
    except Exception:
        return jsonify({'error': 'Invalid upload ID'}), 400

    if not upload:
        return jsonify({'error': 'Upload not found'}), 404

    # Check ownership
    if str(upload['user_id']) != user_id:
        return jsonify({'error': 'Upload not found'}), 404

    # Delete files
    upload_folder = get_upload_folder()
    try:
        os.remove(os.path.join(upload_folder, upload['filename']))
        if upload.get('thumbnail_filename'):
            thumbnail_path = os.path.join(upload_folder, upload['thumbnail_filename'])
            if os.path.exists(thumbnail_path):
                os.remove(thumbnail_path)
    except Exception as e:
        print(f"Error deleting file: {e}")

    # Delete from database
    mongo.db.uploads.delete_one({'_id': ObjectId(upload_id)})

    return jsonify({'message': 'Upload deleted'}), 200


@uploads_bp.route('/my', methods=['GET'])
@jwt_required()
@active_user_required
def get_my_uploads():
    """Get user's uploads"""
    user = get_current_user()
    user_id = str(user['_id'])

    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 20))
    skip = (page - 1) * limit

    uploads = list(mongo.db.uploads.find(
        {'user_id': ObjectId(user_id)}
    ).sort('created_at', -1).skip(skip).limit(limit))

    total = mongo.db.uploads.count_documents({'user_id': ObjectId(user_id)})

    # Add URLs
    base_url = request.host_url.rstrip('/')
    for upload in uploads:
        upload['url'] = f"{base_url}/api/uploads/{upload['_id']}"
        if upload.get('thumbnail_filename'):
            upload['thumbnail_url'] = f"{base_url}/api/uploads/{upload['_id']}/thumbnail"

    return jsonify({
        'uploads': serialize_doc(uploads),
        'total': total,
        'page': page,
        'limit': limit
    }), 200
