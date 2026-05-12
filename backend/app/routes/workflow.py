from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel
from app.models.project import ProjectModel
from app.services.workflow_service import WorkflowService
from app.services.dlp_gate import DLPBlockedError, format_blocked_response
from app.utils.helpers import serialize_doc
from app.utils.permissions import check_project_access
from bson import ObjectId

workflow_bp = Blueprint('workflow', __name__)


def _gate_execute(workflow_id, user_id):
    """Resolve a workflow for execution and check access.

    Returns (workflow_doc, error_response_tuple_or_None).

    If the workflow is project-scoped the caller must hold at least 'editor' on
    the project. Otherwise standard owner/template access via get_by_id applies.
    """
    if not ObjectId.is_valid(workflow_id):
        return None, (jsonify({'error': 'Invalid workflow ID'}), 400)

    raw = WorkflowModel.get_collection().find_one({'_id': ObjectId(workflow_id)})
    if not raw:
        return None, (jsonify({'error': 'Workflow not found'}), 404)

    project_id = raw.get('project_id')
    if project_id:
        if not check_project_access(user_id, project_id, 'editor'):
            return None, (jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403)
        return raw, None

    # Personal workflow — fall back to owner/template check.
    accessible = WorkflowModel.get_by_id(workflow_id, user_id)
    if not accessible:
        return None, (jsonify({'error': 'Workflow not found'}), 404)
    return accessible, None


@workflow_bp.route('/save', methods=['POST'])
@jwt_required()
def save_workflow():
    """Save or create a workflow"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}

        # Validate required fields
        if not data.get('name'):
            return jsonify({'error': 'Workflow name is required'}), 400

        nodes = data.get('nodes', [])
        edges = data.get('edges', [])

        # Check if updating existing workflow
        workflow_id = data.get('_id') or data.get('id')

        if workflow_id:
            # Update existing workflow — refuse project reassignment.
            if 'project_id' in data:
                existing = WorkflowModel.get_collection().find_one(
                    {'_id': ObjectId(workflow_id)},
                    {'project_id': 1}
                )
                if existing is not None:
                    existing_pid = existing.get('project_id')
                    incoming_pid = data.get('project_id')
                    incoming_obj = ObjectId(incoming_pid) if incoming_pid else None
                    if existing_pid != incoming_obj:
                        return jsonify({
                            'error': 'Cannot reassign workflow to a different project',
                            'code': 'cannot_reassign_project'
                        }), 400

            # P1.13: optimistic concurrency. Manual save + 5s auto-save + post-
            # run save can all fire at once; without a version field the last
            # writer silently overwrites the others' edits. Require an
            # If-Match header carrying the version the client last saw; reject
            # with 409 when stale so the client can refresh and retry.
            existing_for_version = WorkflowModel.get_collection().find_one(
                {'_id': ObjectId(workflow_id)},
                {'version': 1},
            )
            current_version = int(existing_for_version.get('version') or 0) if existing_for_version else 0
            client_version_str = (
                request.headers.get('If-Match')
                or (str(data.get('version')) if data.get('version') is not None else None)
            )
            if client_version_str is not None and str(client_version_str).strip() != '':
                try:
                    client_version = int(str(client_version_str).strip().strip('"'))
                except (TypeError, ValueError):
                    return jsonify({
                        'error': 'If-Match header must be an integer version',
                        'code': 'invalid_if_match',
                    }), 400
                if client_version != current_version:
                    return jsonify({
                        'error': 'Workflow has been modified by another writer; refresh and retry',
                        'code': 'version_conflict',
                        'current_version': current_version,
                    }), 409

            updates = {
                'name': data['name'],
                'description': data.get('description', ''),
                'nodes': nodes,
                'edges': edges,
                'version': current_version + 1,
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
            # Create new workflow.
            project_id = data.get('project_id') or None
            workspace_id = data.get('workspace_id') or None

            if project_id:
                if not ObjectId.is_valid(project_id):
                    return jsonify({'error': 'Invalid project_id'}), 400
                if not check_project_access(user_id, project_id, 'editor'):
                    return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403
                # Auto-derive workspace_id from the project.
                project = ProjectModel.find_by_id(project_id)
                if not project:
                    return jsonify({'error': 'Project not found'}), 404
                workspace_id = project.get('workspace_id')

            workflow_id = WorkflowModel.create(
                user_id=user_id,
                name=data['name'],
                description=data.get('description', ''),
                nodes=nodes,
                edges=edges,
                project_id=project_id,
                workspace_id=workspace_id,
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
    """Get workflows for the current user, optionally scoped to a project."""
    try:
        user_id = get_jwt_identity()
        project_id = request.args.get('project_id')

        if project_id:
            if not ObjectId.is_valid(project_id):
                return jsonify({'error': 'Invalid project_id'}), 400
            if not check_project_access(user_id, project_id, 'viewer'):
                return jsonify({'error': 'Project access denied', 'code': 'project_access_denied'}), 403
            workflows = WorkflowModel.find_visible_to(user_id, project_id=project_id)
        else:
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
            # Fall back: project-scoped workflow visible via project membership.
            raw = WorkflowModel.get_collection().find_one({'_id': ObjectId(workflow_id)})
            if raw and raw.get('project_id') and check_project_access(user_id, raw['project_id'], 'viewer'):
                workflow = raw
            else:
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
        data = request.get_json(silent=True) or {}

        workflow_id = data.get('workflow_id')
        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400

        _, err = _gate_execute(workflow_id, user_id)
        if err:
            return err

        # P1.24: refuse to start a second concurrent run for the same workflow.
        # Two simultaneous POSTs would otherwise both create runs, both spawn
        # threads, both burn LLM credit, and both write conflicting node_results
        # to the workflow doc (the auto-save race in useWorkflowState.js made
        # this happen more often than expected). Surface 409 with the existing
        # run_id so the client can subscribe to that instead of restarting.
        existing_running = WorkflowRunModel._get_collection().find_one(
            {'workflow_id': ObjectId(workflow_id), 'status': 'running'},
            {'_id': 1},
        )
        if existing_running:
            return jsonify({
                'error': 'A run is already in progress for this workflow',
                'code': 'workflow_run_in_progress',
                'run_id': str(existing_running['_id']),
            }), 409

        # Execute workflow
        result = WorkflowService.execute_workflow(
            workflow_id=workflow_id,
            user_id=user_id,
            execution_mode='full',
            dlp_confirmed=bool(data.get('dlp_confirmed')),
        )

        return jsonify({
            'message': 'Workflow executed successfully',
            'run_id': result['run_id'],
            'status': result['status'],
            'node_results': result['node_results'],
            'run': serialize_doc(result['run']) if result.get('run') else None
        }), 200

    except DLPBlockedError as dlp_exc:
        return jsonify(format_blocked_response(dlp_exc)), 403
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
        data = request.get_json(silent=True) or {}

        workflow_id = data.get('workflow_id')
        node_id = data.get('node_id')

        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400
        if not node_id:
            return jsonify({'error': 'node_id is required'}), 400

        _, err = _gate_execute(workflow_id, user_id)
        if err:
            return err

        # Execute workflow from specific node
        result = WorkflowService.execute_workflow(
            workflow_id=workflow_id,
            user_id=user_id,
            execution_mode='partial',
            start_node_id=node_id,
            dlp_confirmed=bool(data.get('dlp_confirmed')),
        )

        return jsonify({
            'message': 'Workflow executed successfully',
            'run_id': result['run_id'],
            'status': result['status'],
            'node_results': result['node_results'],
            'run': serialize_doc(result['run']) if result.get('run') else None
        }), 200

    except DLPBlockedError as dlp_exc:
        return jsonify(format_blocked_response(dlp_exc)), 403
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
        data = request.get_json(silent=True) or {}

        workflow_id = data.get('workflow_id')
        node_id = data.get('node_id')

        if not workflow_id:
            return jsonify({'error': 'workflow_id is required'}), 400
        if not node_id:
            return jsonify({'error': 'node_id is required'}), 400

        _, err = _gate_execute(workflow_id, user_id)
        if err:
            return err

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

        # P1.23: the response used to include only image_data/image_id/text/
        # generation_time_ms — so single-node runs against TTS / video / multi-
        # variant aiAgent nodes returned 200 with `audio_data_uri=undefined`,
        # `video_url=undefined`, `text_variants=undefined` and the UI silently
        # showed nothing. Mirror everything the result dict carries.
        return jsonify({
            'message': 'Node executed successfully',
            'node_id': result['node_id'],
            'status': result['status'],
            'image_data': result.get('image_data'),
            'image_id': result.get('image_id'),
            'text': result.get('text'),
            'text_variants': result.get('text_variants'),
            'audio_data_uri': result.get('audio_data_uri'),
            'audio_id': result.get('audio_id'),
            'duration_ms': result.get('duration_ms'),
            'video_url': result.get('video_url'),
            'video_id': result.get('video_id'),
            'duration_sec': result.get('duration_sec'),
            'resolution': result.get('resolution'),
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
