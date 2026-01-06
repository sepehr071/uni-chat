from datetime import datetime
from app.extensions import mongo
from bson import ObjectId


class WorkflowRunModel:
    collection = None

    @classmethod
    def _get_collection(cls):
        if cls.collection is None:
            cls.collection = mongo.db.workflow_runs
        return cls.collection

    @classmethod
    def create(cls, workflow_id, user_id, execution_mode, start_node_id=None):
        """Create a new workflow run

        Args:
            workflow_id: Workflow ID
            user_id: User ID
            execution_mode: "full" | "step" | "partial"
            start_node_id: Starting node for partial runs
        """
        run = {
            'workflow_id': ObjectId(workflow_id),
            'user_id': ObjectId(user_id),
            'status': 'running',
            'execution_mode': execution_mode,
            'start_node_id': start_node_id,
            'node_results': [],
            'started_at': datetime.utcnow(),
            'completed_at': None
        }
        result = cls._get_collection().insert_one(run)
        return str(result.inserted_id)

    @classmethod
    def get_by_id(cls, run_id):
        """Get workflow run by ID"""
        return cls._get_collection().find_one({'_id': ObjectId(run_id)})

    @classmethod
    def get_by_workflow(cls, workflow_id, user_id):
        """Get all runs for a workflow

        Args:
            workflow_id: Workflow ID
            user_id: User ID for ownership check
        """
        runs = list(cls._get_collection().find({
            'workflow_id': ObjectId(workflow_id),
            'user_id': ObjectId(user_id)
        }).sort('started_at', -1))
        return runs

    @classmethod
    def update_status(cls, run_id, status):
        """Update run status

        Args:
            run_id: Run ID
            status: "running" | "completed" | "failed"
        """
        update_data = {'status': status}

        # Set completed_at when status is completed or failed
        if status in ['completed', 'failed']:
            update_data['completed_at'] = datetime.utcnow()

        result = cls._get_collection().update_one(
            {'_id': ObjectId(run_id)},
            {'$set': update_data}
        )
        return result.modified_count > 0

    @classmethod
    def update_node_result(cls, run_id, node_id, result):
        """Update result for a specific node

        Args:
            run_id: Run ID
            node_id: Node ID
            result: Dictionary with node result data
        """
        # Check if node result already exists
        run = cls.get_by_id(run_id)
        if not run:
            return False

        node_results = run.get('node_results', [])
        node_index = next((i for i, nr in enumerate(node_results) if nr['node_id'] == node_id), None)

        if node_index is not None:
            # Update existing node result
            update_query = {}
            for key, value in result.items():
                update_query[f'node_results.{node_index}.{key}'] = value

            cls._get_collection().update_one(
                {'_id': ObjectId(run_id)},
                {'$set': update_query}
            )
        else:
            # Add new node result
            node_result = {
                'node_id': node_id,
                'status': result.get('status', 'pending'),
                'image_data': result.get('image_data'),
                'image_id': ObjectId(result['image_id']) if result.get('image_id') else None,
                'error': result.get('error'),
                'generation_time_ms': result.get('generation_time_ms'),
                'completed_at': result.get('completed_at')
            }

            cls._get_collection().update_one(
                {'_id': ObjectId(run_id)},
                {'$push': {'node_results': node_result}}
            )

        return True

    @classmethod
    def get_node_result(cls, run_id, node_id):
        """Get result for a specific node"""
        run = cls.get_by_id(run_id)
        if not run:
            return None

        node_results = run.get('node_results', [])
        return next((nr for nr in node_results if nr['node_id'] == node_id), None)
