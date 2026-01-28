from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel
from app.services.workflow_service import WorkflowService
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


@workflow_bp.route('/<workflow_id>/duplicate', methods=['POST'])
@jwt_required()
def duplicate_workflow(workflow_id):
    """Duplicate a workflow"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json() or {}

        # Validate ObjectId
        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        # Check workflow exists and user has access
        workflow = WorkflowModel.get_by_id(workflow_id, user_id)
        if not workflow:
            return jsonify({'error': 'Workflow not found'}), 404

        # Duplicate with optional custom name
        new_name = data.get('name')
        new_workflow_id = WorkflowModel.duplicate(workflow_id, user_id, new_name)

        if not new_workflow_id:
            return jsonify({'error': 'Failed to duplicate workflow'}), 500

        new_workflow = WorkflowModel.get_by_id(new_workflow_id, user_id)
        return jsonify({
            'message': 'Workflow duplicated successfully',
            'workflow': serialize_doc(new_workflow)
        }), 201

    except Exception as e:
        print(f"Error duplicating workflow: {str(e)}")
        return jsonify({'error': 'Failed to duplicate workflow'}), 500


@workflow_bp.route('/execute', methods=['POST'])
@jwt_required()
def execute_workflow():
    """Execute a workflow completely"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        workflow_id = data.get('workflow_id')
        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400

        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        # Execute workflow
        result = WorkflowService.execute_workflow(
            workflow_id=workflow_id,
            user_id=user_id,
            execution_mode='full'
        )

        return jsonify({
            'message': 'Workflow executed successfully',
            'run_id': result['run_id'],
            'status': result['status'],
            'node_results': result['node_results'],
            'run': serialize_doc(result['run']) if result.get('run') else None
        }), 200

    except ValueError as e:
        print(f"[execute_workflow] ValueError: {str(e)}")
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        import traceback
        print(f"[execute_workflow] Exception: {str(e)}")
        print(f"[execute_workflow] Traceback:\n{traceback.format_exc()}")
        return jsonify({'error': f'Failed to execute workflow: {str(e)}'}), 500


@workflow_bp.route('/execute-from', methods=['POST'])
@jwt_required()
def execute_from_node():
    """Execute workflow starting from a specific node"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        workflow_id = data.get('workflow_id')
        node_id = data.get('node_id')

        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400
        if not node_id:
            return jsonify({'error': 'node_id is required'}), 400

        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        # Execute workflow from specific node
        result = WorkflowService.execute_workflow(
            workflow_id=workflow_id,
            user_id=user_id,
            execution_mode='partial',
            start_node_id=node_id
        )

        return jsonify({
            'message': 'Workflow executed successfully',
            'run_id': result['run_id'],
            'status': result['status'],
            'node_results': result['node_results'],
            'run': serialize_doc(result['run']) if result.get('run') else None
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error executing workflow from node: {str(e)}")
        return jsonify({'error': 'Failed to execute workflow'}), 500


@workflow_bp.route('/execute-node', methods=['POST'])
@jwt_required()
def execute_single_node():
    """Execute only a single node using existing inputs from connected nodes"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json()

        workflow_id = data.get('workflow_id')
        node_id = data.get('node_id')

        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400
        if not node_id:
            return jsonify({'error': 'node_id is required'}), 400

        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        # Execute single node
        result = WorkflowService.execute_single_node(
            workflow_id=workflow_id,
            node_id=node_id,
            user_id=user_id
        )

        if result['status'] == 'failed':
            return jsonify({
                'error': result.get('error', 'Node execution failed'),
                'node_id': node_id,
                'status': 'failed'
            }), 400

        return jsonify({
            'message': 'Node executed successfully',
            'node_id': result['node_id'],
            'status': result['status'],
            'image_data': result.get('image_data'),
            'image_id': result.get('image_id'),
            'text': result.get('text'),
            'generation_time_ms': result.get('generation_time_ms')
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error executing single node: {str(e)}")
        return jsonify({'error': 'Failed to execute node'}), 500


@workflow_bp.route('/runs/<workflow_id>', methods=['GET'])
@jwt_required()
def get_workflow_runs(workflow_id):
    """Get execution history for a workflow"""
    try:
        user_id = get_jwt_identity()

        if not ObjectId.is_valid(workflow_id):
            return jsonify({'error': 'Invalid workflow ID'}), 400

        runs = WorkflowService.get_workflow_runs(
            workflow_id=workflow_id,
            user_id=user_id
        )

        return jsonify({
            'runs': [serialize_doc(r) for r in runs]
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        print(f"Error getting workflow runs: {str(e)}")
        return jsonify({'error': 'Failed to get workflow runs'}), 500
