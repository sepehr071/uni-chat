"""
Workflow execution service for image generation workflows.
Handles topological sorting, node execution, and workflow runs.
"""
import time
from datetime import datetime
from collections import deque, defaultdict
from bson import ObjectId

from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel
from app.models.generated_image import GeneratedImageModel
from app.services.openrouter_service import OpenRouterService


class WorkflowService:
    """Service for executing image generation workflows."""

    @staticmethod
    def build_execution_graph(nodes, edges):
        """
        Build topological order for executing nodes using Kahn's algorithm.

        Args:
            nodes: List of workflow nodes
            edges: List of workflow edges

        Returns:
            List of node IDs in execution order

        Raises:
            ValueError: If workflow contains cycles
        """
        # Build adjacency list and in-degree count
        graph = defaultdict(list)
        in_degree = {node['id']: 0 for node in nodes}

        for edge in edges:
            source = edge['source']
            target = edge['target']
            graph[source].append(target)
            in_degree[target] = in_degree.get(target, 0) + 1

        # Find all nodes with in-degree 0 (start nodes)
        queue = deque([node_id for node_id, degree in in_degree.items() if degree == 0])

        # Kahn's algorithm for topological sort
        execution_order = []

        while queue:
            node_id = queue.popleft()
            execution_order.append(node_id)

            # Decrease in-degree for all neighbors
            for neighbor in graph[node_id]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        # Check for cycles
        if len(execution_order) != len(nodes):
            raise ValueError("Workflow contains cycles and cannot be executed")

        return execution_order

    @staticmethod
    def get_node_inputs(node_id, edges, node_results):
        """
        Get input images for a node from connected predecessor nodes.

        Args:
            node_id: Target node ID
            edges: List of workflow edges
            node_results: Dictionary of node_id -> execution results

        Returns:
            List of base64 image data strings
        """
        input_images = []

        # Find all edges that target this node
        for edge in edges:
            if edge['target'] == node_id:
                source_id = edge['source']
                if source_id in node_results:
                    result = node_results[source_id]
                    if result.get('image_data'):
                        input_images.append(result['image_data'])

        return input_images

    @staticmethod
    def execute_node(node, input_images, user_id):
        """
        Execute a single workflow node.

        Args:
            node: Node configuration
            input_images: List of base64 image data strings from predecessor nodes
            user_id: User ID for saving generated images

        Returns:
            Dict with:
                - image_data: Base64 data URI string
                - image_id: MongoDB ObjectId string (for imageGen nodes)
                - generation_time_ms: Execution time in milliseconds

        Raises:
            ValueError: If node execution fails
        """
        start_time = time.time()
        node_type = node['type']
        node_data = node.get('data', {})

        try:
            if node_type == 'imageUpload':
                # Return the uploaded image
                image_data = node_data.get('imageUrl')
                if not image_data:
                    raise ValueError("Image upload node has no image data")

                return {
                    'image_data': image_data,
                    'generation_time_ms': int((time.time() - start_time) * 1000)
                }

            elif node_type == 'imageGen':
                # Generate image using OpenRouter
                model = node_data.get('model')
                prompt = node_data.get('prompt')
                negative_prompt = node_data.get('negativePrompt', '')

                if not model or not prompt:
                    raise ValueError("Image generation node missing model or prompt")

                # Call OpenRouter service
                result = OpenRouterService.generate_image(
                    prompt=prompt,
                    model=model,
                    negative_prompt=negative_prompt,
                    input_images=input_images
                )

                if not result.get('success'):
                    raise ValueError(result.get('error', 'Image generation failed'))

                image_data = result['image_data']

                # Save to generated_images collection
                saved_image = GeneratedImageModel.create(
                    user_id=user_id,
                    prompt=prompt,
                    model_id=model,
                    image_data=image_data,
                    negative_prompt=negative_prompt,
                    settings={
                        'input_images_count': len(input_images),
                        'has_input_images': len(input_images) > 0
                    },
                    metadata={
                        'workflow_execution': True
                    }
                )

                return {
                    'image_data': image_data,
                    'image_id': str(saved_image['_id']),
                    'generation_time_ms': int((time.time() - start_time) * 1000)
                }

            else:
                raise ValueError(f"Unknown node type: {node_type}")

        except Exception as e:
            raise ValueError(f"Node execution failed: {str(e)}")

    @classmethod
    def execute_workflow(cls, workflow_id, user_id, execution_mode='full', start_node_id=None):
        """
        Execute entire workflow or from a specific node.

        Args:
            workflow_id: Workflow to execute
            user_id: User ID
            execution_mode: 'full' | 'partial'
            start_node_id: For partial runs, which node to start from

        Returns:
            Dict with run_id and node_results

        Raises:
            ValueError: If workflow not found or execution fails
        """
        # Load workflow
        workflow = WorkflowModel.get_by_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("Workflow not found")

        # Verify ownership
        if str(workflow['user_id']) != str(user_id):
            raise ValueError("Unauthorized access to workflow")

        nodes = workflow.get('nodes', [])
        edges = workflow.get('edges', [])

        if not nodes:
            raise ValueError("Workflow has no nodes")

        # Create workflow run record
        run_id = WorkflowRunModel.create(
            workflow_id=workflow_id,
            user_id=user_id,
            execution_mode=execution_mode,
            start_node_id=start_node_id
        )

        try:
            # Build execution order
            execution_order = cls.build_execution_graph(nodes, edges)

            # For partial runs, filter to only execute from start_node_id onwards
            if execution_mode == 'partial' and start_node_id:
                # Find all ancestors of start_node_id using BFS
                ancestors = set()
                queue = deque([start_node_id])

                # Build reverse graph (target -> sources)
                reverse_graph = defaultdict(list)
                for edge in edges:
                    reverse_graph[edge['target']].append(edge['source'])

                # BFS to find all ancestors
                while queue:
                    node_id = queue.popleft()
                    if node_id not in ancestors:
                        ancestors.add(node_id)
                        queue.extend(reverse_graph[node_id])

                # Filter execution order to only include ancestors and start node
                execution_order = [
                    node_id for node_id in execution_order
                    if node_id in ancestors
                ]

            # Execute nodes in order
            node_results = {}
            nodes_by_id = {node['id']: node for node in nodes}

            for node_id in execution_order:
                if node_id not in nodes_by_id:
                    continue

                node = nodes_by_id[node_id]

                # Update node status to running
                WorkflowRunModel.update_node_result(run_id, node_id, {
                    'status': 'running'
                })

                # Get input images from predecessor nodes
                input_images = cls.get_node_inputs(node_id, edges, node_results)

                # Execute node
                try:
                    result = cls.execute_node(node, input_images, user_id)
                    node_results[node_id] = {
                        'status': 'completed',
                        'image_data': result['image_data'],
                        'image_id': result.get('image_id'),
                        'generation_time_ms': result['generation_time_ms']
                    }

                    # Update node result in database
                    WorkflowRunModel.update_node_result(run_id, node_id, {
                        'status': 'completed',
                        'image_data': result['image_data'],
                        'image_id': result.get('image_id'),
                        'generation_time_ms': result['generation_time_ms'],
                        'completed_at': datetime.utcnow()
                    })

                except Exception as e:
                    # Node execution failed
                    node_results[node_id] = {
                        'status': 'failed',
                        'error': str(e)
                    }

                    # Update node result
                    WorkflowRunModel.update_node_result(run_id, node_id, {
                        'status': 'failed',
                        'error': str(e),
                        'completed_at': datetime.utcnow()
                    })

                    # Update run as failed and stop execution
                    WorkflowRunModel.update_status(run_id, 'failed')

                    run = WorkflowRunModel.get_by_id(run_id)
                    return {
                        'run_id': run_id,
                        'status': 'failed',
                        'node_results': node_results,
                        'error': f"Node {node_id} failed: {str(e)}",
                        'run': run
                    }

            # All nodes executed successfully
            WorkflowRunModel.update_status(run_id, 'completed')

            run = WorkflowRunModel.get_by_id(run_id)
            return {
                'run_id': run_id,
                'status': 'completed',
                'node_results': node_results,
                'run': run
            }

        except Exception as e:
            # Workflow execution failed
            WorkflowRunModel.update_status(run_id, 'failed')
            raise ValueError(f"Workflow execution failed: {str(e)}")

    @classmethod
    def execute_single_node(cls, workflow_id, node_id, user_id):
        """
        Execute only a single node using existing input images from connected nodes.
        Does NOT re-execute ancestor nodes - uses their existing generatedImage or imageUrl.

        Args:
            workflow_id: Workflow ID
            node_id: Node ID to execute
            user_id: User ID

        Returns:
            Dict with node execution result

        Raises:
            ValueError: If node not found or missing required inputs
        """
        # Load workflow
        workflow = WorkflowModel.get_by_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("Workflow not found")

        # Verify ownership
        if str(workflow['user_id']) != str(user_id):
            raise ValueError("Unauthorized access to workflow")

        nodes = workflow.get('nodes', [])
        edges = workflow.get('edges', [])

        # Find target node
        nodes_by_id = {node['id']: node for node in nodes}
        if node_id not in nodes_by_id:
            raise ValueError(f"Node {node_id} not found in workflow")

        target_node = nodes_by_id[node_id]

        # Get input images from connected predecessor nodes using their existing data
        input_images = []
        for edge in edges:
            if edge['target'] == node_id:
                source_id = edge['source']
                if source_id in nodes_by_id:
                    source_node = nodes_by_id[source_id]
                    source_data = source_node.get('data', {})

                    # Check for existing image data
                    image_data = None
                    if source_node['type'] == 'imageUpload':
                        image_data = source_data.get('imageUrl')
                    elif source_node['type'] == 'imageGen':
                        image_data = source_data.get('generatedImage')

                    if image_data:
                        input_images.append(image_data)
                    else:
                        # Input node has no image - user must run it first
                        raise ValueError(
                            f"Input node '{source_id}' has no image. "
                            "Please run it first or upload an image."
                        )

        # Execute the single node
        try:
            result = cls.execute_node(target_node, input_images, user_id)
            return {
                'status': 'completed',
                'node_id': node_id,
                'image_data': result['image_data'],
                'image_id': result.get('image_id'),
                'generation_time_ms': result['generation_time_ms']
            }
        except Exception as e:
            return {
                'status': 'failed',
                'node_id': node_id,
                'error': str(e)
            }

    @staticmethod
    def get_workflow_runs(workflow_id, user_id, limit=10):
        """
        Get execution history for a workflow.

        Args:
            workflow_id: Workflow ID
            user_id: User ID
            limit: Maximum number of runs to return

        Returns:
            List of WorkflowRun documents
        """
        # Verify workflow ownership
        workflow = WorkflowModel.get_by_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("Workflow not found")

        if str(workflow['user_id']) != str(user_id):
            raise ValueError("Unauthorized access to workflow")

        return WorkflowRunModel.get_by_workflow(workflow_id, user_id)
