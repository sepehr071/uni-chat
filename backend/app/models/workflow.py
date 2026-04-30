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

    @staticmethod
    def get_collection():
        """Public collection accessor (mirrors newer model conventions)."""
        return WorkflowModel._get_collection()

    @staticmethod
    def create_indexes():
        """Create necessary indexes for workflows.

        - (user_id, updated_at desc) for personal listing
        - (project_id, updated_at desc) for project-scoped listing
        - is_template for template lookups
        """
        collection = WorkflowModel.get_collection()
        collection.create_index([('user_id', 1), ('updated_at', -1)])
        collection.create_index([('project_id', 1), ('updated_at', -1)])
        collection.create_index('is_template')

    @classmethod
    def create(cls, user_id, name, description, nodes, edges, is_template=False,
               project_id=None, workspace_id=None):
        """Create a new workflow.

        Args:
            user_id: Owner user id (str or ObjectId; nullable for templates)
            name: Display name
            description: Optional description
            nodes: React Flow nodes list
            edges: React Flow edges list
            is_template: System template flag
            project_id: Optional project scope (str or ObjectId)
            workspace_id: Optional denormalized workspace scope (str or ObjectId)
        """
        workflow = {
            'user_id': ObjectId(user_id) if user_id else None,
            'name': name,
            'description': description or '',
            'nodes': nodes,
            'edges': edges,
            'is_template': is_template,
            'project_id': ObjectId(project_id) if project_id else None,
            'workspace_id': ObjectId(workspace_id) if workspace_id else None,
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

    @staticmethod
    def find_by_project(project_id, skip=0, limit=50):
        """List workflows scoped to a project, newest first."""
        if isinstance(project_id, str):
            project_id = ObjectId(project_id)
        cursor = WorkflowModel.get_collection().find(
            {'project_id': project_id}
        ).sort('updated_at', -1).skip(skip).limit(limit)
        return list(cursor)

    @staticmethod
    def find_visible_to(user_id, project_id=None, skip=0, limit=100):
        """Caller's own + project-scoped if project_id."""
        if isinstance(user_id, str):
            user_id = ObjectId(user_id)
        query_or = [{'user_id': user_id}]
        if project_id:
            if isinstance(project_id, str):
                project_id = ObjectId(project_id)
            query_or.append({'project_id': project_id})
        cursor = WorkflowModel.get_collection().find(
            {'$or': query_or}
        ).sort('updated_at', -1).skip(skip).limit(limit)
        return list(cursor)

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
