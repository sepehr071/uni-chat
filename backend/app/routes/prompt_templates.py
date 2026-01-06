from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.prompt_template import PromptTemplateModel
from app.models.user import UserModel
from app.utils.helpers import serialize_doc
from app.utils.decorators import admin_required

prompt_templates_bp = Blueprint('prompt_templates', __name__)


@prompt_templates_bp.route('/list', methods=['GET'])
@jwt_required()
def get_templates():
    """Get all active prompt templates"""
    category = request.args.get('category')

    if category:
        templates = PromptTemplateModel.find_by_category(category)
    else:
        templates = PromptTemplateModel.find_all_active()

    return jsonify({
        'templates': [serialize_doc(t) for t in templates]
    })


@prompt_templates_bp.route('/categories', methods=['GET'])
@jwt_required()
def get_categories():
    """Get list of all template categories"""
    categories = PromptTemplateModel.get_categories()
    return jsonify({'categories': categories})


@prompt_templates_bp.route('/<template_id>/use', methods=['POST'])
@jwt_required()
def use_template(template_id):
    """Increment usage count when template is used"""
    template = PromptTemplateModel.find_by_id(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    PromptTemplateModel.increment_usage(template_id)
    return jsonify({'message': 'Usage recorded'})


@prompt_templates_bp.route('/', methods=['POST'])
@jwt_required()
@admin_required
def create_template():
    """Create a new prompt template (admin only)"""
    user_id = get_jwt_identity()
    data = request.get_json()

    name = data.get('name', '').strip()
    if not name:
        return jsonify({'error': 'Name is required'}), 400

    category = data.get('category', '').strip()
    if not category:
        return jsonify({'error': 'Category is required'}), 400

    template_text = data.get('template_text', '').strip()
    if not template_text:
        return jsonify({'error': 'Template text is required'}), 400

    variables = data.get('variables', [])
    description = data.get('description', '')

    template = PromptTemplateModel.create(
        name=name,
        category=category,
        template_text=template_text,
        variables=variables,
        description=description,
        created_by=user_id
    )

    return jsonify({
        'message': 'Template created',
        'template': serialize_doc(template)
    }), 201


@prompt_templates_bp.route('/<template_id>', methods=['PUT'])
@jwt_required()
@admin_required
def update_template(template_id):
    """Update a prompt template (admin only)"""
    template = PromptTemplateModel.find_by_id(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    data = request.get_json()
    updates = {}

    if 'name' in data:
        updates['name'] = data['name'].strip()
    if 'category' in data:
        updates['category'] = data['category'].strip()
    if 'template_text' in data:
        updates['template_text'] = data['template_text'].strip()
    if 'variables' in data:
        updates['variables'] = data['variables']
    if 'description' in data:
        updates['description'] = data['description']
    if 'is_active' in data:
        updates['is_active'] = data['is_active']

    PromptTemplateModel.update(template_id, updates)

    return jsonify({'message': 'Template updated'})


@prompt_templates_bp.route('/<template_id>', methods=['DELETE'])
@jwt_required()
@admin_required
def delete_template(template_id):
    """Delete a prompt template (admin only)"""
    template = PromptTemplateModel.find_by_id(template_id)
    if not template:
        return jsonify({'error': 'Template not found'}), 404

    PromptTemplateModel.delete(template_id)

    return jsonify({'message': 'Template deleted'})
