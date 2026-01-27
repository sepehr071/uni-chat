from datetime import datetime
from app.extensions import mongo
from bson import ObjectId


class WorkflowModel:
    collection = None

    @classmethod
    def _get_collection(cls):
        if cls.collection is None:
            cls.collection = mongo.db.workflows
        return cls.collection

    @classmethod
    def create(cls, user_id, name, description, nodes, edges, is_template=False):
        """Create a new workflow"""
        workflow = {
            'user_id': ObjectId(user_id) if user_id else None,
            'name': name,
            'description': description or '',
            'nodes': nodes,
            'edges': edges,
            'is_template': is_template,
            'created_at': datetime.utcnow(),
            'updated_at': datetime.utcnow()
        }
        result = cls._get_collection().insert_one(workflow)
        return str(result.inserted_id)

    @classmethod
    def get_by_id(cls, workflow_id, user_id=None):
        """Get workflow by ID

        Args:
            workflow_id: Workflow ID
            user_id: User ID for ownership check (None for templates)
        """
        query = {'_id': ObjectId(workflow_id)}

        # If user_id provided, check ownership or template
        if user_id:
            query['$or'] = [
                {'user_id': ObjectId(user_id)},
                {'is_template': True}
            ]

        return cls._get_collection().find_one(query)

    @classmethod
    def get_by_user(cls, user_id):
        """Get all workflows for a user"""
        workflows = list(cls._get_collection().find({
            'user_id': ObjectId(user_id)
        }).sort('updated_at', -1))
        return workflows

    @classmethod
    def update(cls, workflow_id, user_id, updates):
        """Update workflow

        Args:
            workflow_id: Workflow ID
            user_id: User ID for ownership check
            updates: Dictionary of fields to update
        """
        # Add updated_at timestamp
        updates['updated_at'] = datetime.utcnow()

        result = cls._get_collection().update_one(
            {
                '_id': ObjectId(workflow_id),
                'user_id': ObjectId(user_id)
            },
            {'$set': updates}
        )
        return result.modified_count > 0

    @classmethod
    def delete(cls, workflow_id, user_id):
        """Delete workflow

        Args:
            workflow_id: Workflow ID
            user_id: User ID for ownership check
        """
        result = cls._get_collection().delete_one({
            '_id': ObjectId(workflow_id),
            'user_id': ObjectId(user_id)
        })
        return result.deleted_count > 0

    @classmethod
    def get_templates(cls):
        """Get all system templates"""
        templates = list(cls._get_collection().find({
            'is_template': True
        }).sort('name', 1))
        return templates

    @classmethod
    def duplicate(cls, workflow_id, user_id, new_name=None):
        """Duplicate a workflow for a user

        Args:
            workflow_id: ID of workflow to duplicate
            user_id: User ID for the new workflow owner
            new_name: Optional custom name for the copy
        """
        original = cls.get_by_id(workflow_id, user_id)
        if not original:
            return None

        return cls.create(
            user_id=user_id,
            name=new_name or f"{original['name']} (Copy)",
            description=original.get('description', ''),
            nodes=original.get('nodes', []),
            edges=original.get('edges', []),
            is_template=False
        )
