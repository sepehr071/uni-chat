from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.workflow import WorkflowModel
from app.utils.helpers import serialize_doc
from bson import ObjectId

workflow_bp = Blueprint('workflow', __name__)


@workflow_bp.route('/save', methods=['POST'])
@jwt_required()
def save_workflow():
    """Save or create a workflow"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Workflow name is required'}), 400

        nodes = data.get('nodes', [])
        edges = data.get('edges', [])

        # Check if updating existing workflow
        workflow_id = data.get('_id') or data.get('id')

        if workflow_id:
            # Update existing workflow
            updates = {
                'name': data['name'],
                'description': data.get('description', ''),
                'nodes': nodes,
                'edges': edges
            }

            success = WorkflowModel.update(workflow_id, user_id, updates)
            if not success:
                return jsonify({'error': 'Workflow not found or unauthorized'}), 404

            workflow = WorkflowModel.get_by_id(workflow_id, user_id)
            return jsonify({
                'message': 'Workflow updated successfully',
                'workflow': serialize_doc(workflow)
            }), 200
        else:
            # Create new workflow
            workflow_id = WorkflowModel.create(
                user_id=user_id,
                name=data['name'],
                description=data.get('description', ''),
                nodes=nodes,
                edges=edges
            )

            workflow = WorkflowModel.get_by_id(workflow_id, user_id)
            return jsonify({
                'message': 'Workflow created successfully',
                'workflow': serialize_doc(workflow)
            }), 201

    except Exception as e:
        print(f"Error saving workflow: {str(e)}")
        return jsonify({'error': 'Failed to save workflow'}), 500


@workflow_bp.route('/list', methods=['GET'])
@jwt_required()
def list_workflows():
    """Get all workflows for the current user"""
    try:
        user_id = get_jwt_identity()
        workflows = WorkflowModel.get_by_user(user_id)

        return jsonify({
            'workflows': [serialize_doc(w) for w in workflows]
        }), 200

    except Exception as e:
        print(f"Error listing workflows: {str(e)}")
        return jsonify({'error': 'Failed to list workflows'}), 500


@workflow_bp.route('/<workflow_id>', methods=['GET'])
@jwt_required()
def get_workflow(workflow_id):
    """Get a specific workflow by ID"""
    try:
        user_id = get_jwt_identity()

        # Validate ObjectId
        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        workflow = WorkflowModel.get_by_id(workflow_id, user_id)
        if not workflow:
            return jsonify({'error': 'Workflow not found'}), 404

        return jsonify({
            'workflow': serialize_doc(workflow)
        }), 200

    except Exception as e:
        print(f"Error getting workflow: {str(e)}")
        return jsonify({'error': 'Failed to get workflow'}), 500


@workflow_bp.route('/<workflow_id>', methods=['DELETE'])
@jwt_required()
def delete_workflow(workflow_id):
    """Delete a workflow"""
    try:
        user_id = get_jwt_identity()

        # Validate ObjectId
        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        success = WorkflowModel.delete(workflow_id, user_id)
        if not success:
            return jsonify({'error': 'Workflow not found or unauthorized'}), 404

        return jsonify({
            'message': 'Workflow deleted successfully'
        }), 200

    except Exception as e:
        print(f"Error deleting workflow: {str(e)}")
        return jsonify({'error': 'Failed to delete workflow'}), 500


@workflow_bp.route('/templates', methods=['GET'])
@jwt_required()
def get_templates():
    """Get all workflow templates"""
    try:
        templates = WorkflowModel.get_templates()

        return jsonify({
            'templates': [serialize_doc(t) for t in templates]
        }), 200

    except Exception as e:
        print(f"Error getting templates: {str(e)}")
        return jsonify({'error': 'Failed to get templates'}), 500
