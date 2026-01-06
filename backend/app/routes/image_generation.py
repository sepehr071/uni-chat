from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.generated_image import GeneratedImageModel
from app.services.openrouter_service import OpenRouterService
from app.utils.helpers import serialize_doc
import time

image_gen_bp = Blueprint('image_generation', __name__)


@image_gen_bp.route('/models', methods=['GET'])
@jwt_required()
def get_image_models():
    """Get available image generation models"""
    models = OpenRouterService.get_image_capable_models()
    return jsonify({'models': models})


@image_gen_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_image():
    """Generate an image"""
    user_id = get_jwt_identity()
    data = request.get_json()

    prompt = data.get('prompt', '').strip()
    if not prompt:
        return jsonify({'error': 'Prompt is required'}), 400

    model = data.get('model')
    if not model:
        return jsonify({'error': 'Model is required'}), 400

    negative_prompt = data.get('negative_prompt', '')
    input_images = data.get('input_images', [])

    # Validate input_images if provided
    if input_images:
        if not isinstance(input_images, list):
            return jsonify({'error': 'input_images must be a list'}), 400

        # Validate each image is base64 data URI or URL
        for img in input_images:
            if not img.startswith('data:image/') and not img.startswith('http'):
                return jsonify({'error': 'Invalid image format. Must be base64 data URI or URL'}), 400

        # Check model-specific limits
        max_images = OpenRouterService.IMAGE_GENERATION_LIMITS.get(model, 0)
        if len(input_images) > max_images:
            return jsonify({'error': f'Model supports maximum {max_images} input images'}), 400

    start_time = time.time()

    result = OpenRouterService.generate_image(
        prompt=prompt,
        model=model,
        negative_prompt=negative_prompt,
        input_images=input_images if input_images else None
    )

    generation_time = int((time.time() - start_time) * 1000)

    if not result.get('success'):
        return jsonify({'error': result.get('error', 'Generation failed')}), 500

    # Save to database
    image = GeneratedImageModel.create(
        user_id=user_id,
        prompt=prompt,
        model_id=model,
        image_data=result['image_data'],
        negative_prompt=negative_prompt,
        settings={
            'input_images_count': len(input_images) if input_images else 0,
            'has_input_images': bool(input_images)
        },
        metadata={
            'generation_time_ms': generation_time,
            'usage': result.get('usage', {})
        }
    )

    return jsonify({
        'image': serialize_doc(image),
        'image_data': result['image_data']
    })


@image_gen_bp.route('/history', methods=['GET'])
@jwt_required()
def get_history():
    """Get user's image generation history"""
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    limit = request.args.get('limit', 20, type=int)
    favorites_only = request.args.get('favorites', 'false').lower() == 'true'

    skip = (page - 1) * limit
    images = GeneratedImageModel.find_by_user(user_id, skip=skip, limit=limit, favorites_only=favorites_only)
    total = GeneratedImageModel.count_by_user(user_id, favorites_only=favorites_only)

    return jsonify({
        'images': [serialize_doc(img) for img in images],
        'total': total,
        'page': page,
        'pages': (total + limit - 1) // limit
    })


@image_gen_bp.route('/<image_id>', methods=['DELETE'])
@jwt_required()
def delete_image(image_id):
    """Delete an image"""
    user_id = get_jwt_identity()

    image = GeneratedImageModel.find_by_id(image_id)
    if not image:
        return jsonify({'error': 'Image not found'}), 404

    if str(image['user_id']) != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    GeneratedImageModel.delete(image_id)
    return jsonify({'message': 'Image deleted'})


@image_gen_bp.route('/<image_id>/favorite', methods=['POST'])
@jwt_required()
def toggle_favorite(image_id):
    """Toggle favorite status"""
    user_id = get_jwt_identity()

    image = GeneratedImageModel.find_by_id(image_id)
    if not image:
        return jsonify({'error': 'Image not found'}), 404

    if str(image['user_id']) != user_id:
        return jsonify({'error': 'Unauthorized'}), 403

    new_status = GeneratedImageModel.toggle_favorite(image_id)
    return jsonify({'is_favorite': new_status})
