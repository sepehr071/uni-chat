"""
Workflow execution service for image generation workflows.
Handles topological sorting, node execution, and workflow runs.
"""
import time
import threading
from datetime import datetime
from collections import deque, defaultdict
from bson import ObjectId
from flask import current_app

from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel
from app.models.generated_image import GeneratedImageModel
from app.models.user import UserModel
from app.services.openrouter_service import OpenRouterService


class WorkflowService:
    """Service for executing image generation workflows."""

    @staticmethod
    def build_execution_graph(nodes, edges):
        """
        Build execution layers using modified Kahn's algorithm.
        Nodes in the same layer have no dependencies on each other and can run in parallel.

        Args:
            nodes: List of workflow nodes
            edges: List of workflow edges

        Returns:
            List of layers, where each layer is a list of node IDs that can run in parallel.
            Example: [[layer0_nodes], [layer1_nodes], [layer2_nodes]]

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

        # Start with nodes that have no incoming edges (layer 0)
        current_layer = [node_id for node_id, degree in in_degree.items() if degree == 0]
        execution_layers = []
        processed = set()

        while current_layer:
            execution_layers.append(current_layer)
            processed.update(current_layer)

            # Find next layer - nodes whose dependencies are all satisfied
            next_layer = []
            for node_id in current_layer:
                for neighbor in graph[node_id]:
                    in_degree[neighbor] -= 1
                    if in_degree[neighbor] == 0 and neighbor not in processed:
                        next_layer.append(neighbor)

            current_layer = next_layer

        # Check for cycles
        if len(processed) != len(nodes):
            raise ValueError("Workflow contains cycles and cannot be executed")

        return execution_layers

    @staticmethod
    def get_node_inputs(node_id, edges, node_results):
        """
        Get inputs for a node from connected predecessor nodes.
        Supports both image data and text outputs.

        Args:
            node_id: Target node ID
            edges: List of workflow edges
            node_results: Dictionary of node_id -> execution results

        Returns:
            List of inputs (base64 image data strings or text strings)
        """
        inputs = []

        print(f"[get_node_inputs] Getting inputs for node: {node_id}")

        # Find all edges that target this node
        for edge in edges:
            if edge['target'] == node_id:
                source_id = edge['source']
                print(f"[get_node_inputs] Found edge from {source_id} to {node_id}")
                if source_id in node_results:
                    result = node_results[source_id]
                    print(f"[get_node_inputs] Source result: status={result.get('status')}, has_text={result.get('text') is not None}, has_image={result.get('image_data') is not None}")
                    # Check for text output first (from textInput and aiAgent nodes)
                    # Use 'text' in result to check if key exists, even if empty string
                    if 'text' in result and result['text'] is not None:
                        inputs.append(result['text'])
                        print(f"[get_node_inputs] Added text input (length: {len(result['text'])})")
                    # Then check for image output (from imageUpload and imageGen nodes)
                    elif result.get('image_data'):
                        inputs.append(result['image_data'])
                        print(f"[get_node_inputs] Added image input")
                else:
                    print(f"[get_node_inputs] Source {source_id} not in node_results")

        print(f"[get_node_inputs] Total inputs found: {len(inputs)}")
        return inputs

    @staticmethod
    def execute_node(node, input_data, user_id):
        """
        Execute a single workflow node.

        Args:
            node: Node configuration
            input_data: List of inputs from predecessor nodes (images or text)
            user_id: User ID for saving generated images

        Returns:
            Dict with:
                - image_data: Base64 data URI string (for image nodes)
                - text: Text output (for text/AI nodes)
                - image_id: MongoDB ObjectId string (for imageGen nodes)
                - node_id: The node ID
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
                    'node_id': node['id'],
                    'generation_time_ms': int((time.time() - start_time) * 1000)
                }

            elif node_type == 'imageGen':
                # Generate image using OpenRouter
                model = node_data.get('model')
                prompt = node_data.get('prompt')
                negative_prompt = node_data.get('negativePrompt', '')

                if not model or not prompt:
                    raise ValueError("Image generation node missing model or prompt")

                # Filter input_data to only include image data (base64 strings starting with data:image)
                input_images = [
                    inp for inp in input_data
                    if isinstance(inp, str) and (inp.startswith('data:image') or inp.startswith('http'))
                ]

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
                    'node_id': node['id'],
                    'generation_time_ms': int((time.time() - start_time) * 1000)
                }

            elif node_type == 'textInput':
                # Return the static text from the node
                text_value = node_data.get('text', '')
                print(f"[textInput] Returning text: '{text_value[:100] if text_value else 'EMPTY'}...'")
                return {
                    'text': text_value,
                    'node_id': node['id'],
                    'generation_time_ms': 0
                }

            elif node_type == 'aiAgent':
                # Debug logging
                print(f"[aiAgent] Node data: {node_data}")
                print(f"[aiAgent] Input data received: {input_data}")

                # Get text inputs from connected nodes
                input_texts = [inp for inp in input_data if isinstance(inp, str)]
                combined_input = '\n\n'.join(input_texts)
                print(f"[aiAgent] Combined input: {combined_input[:200] if combined_input else 'EMPTY'}...")

                # Build prompt from template (replace {{input}} placeholder)
                template = node_data.get('user_prompt_template', '{{input}}')
                user_prompt = template.replace('{{input}}', combined_input)
                print(f"[aiAgent] User prompt: {user_prompt[:200]}...")

                # Get user preferences for injection
                user = UserModel.find_by_id(user_id)
                ai_prefs = user.get('ai_preferences', {}) if user else {}
                enhanced_system = OpenRouterService.build_enhanced_system_prompt(
                    node_data.get('system_prompt', ''),
                    ai_prefs
                )
                print(f"[aiAgent] System prompt: {enhanced_system[:200] if enhanced_system else 'NONE'}...")

                # Get model from node config
                model = node_data.get('model')
                print(f"[aiAgent] Model: {model}")
                if not model:
                    raise ValueError("AI Agent node missing model configuration")

                # Call LLM (non-streaming)
                response = OpenRouterService.chat_completion(
                    messages=[{'role': 'user', 'content': user_prompt}],
                    model=model,
                    system_prompt=enhanced_system,
                    temperature=node_data.get('temperature', 0.7),
                    max_tokens=node_data.get('max_tokens', 2048),
                    stream=False
                )

                # Handle error response
                if 'error' in response:
                    raise ValueError(response['error'].get('message', 'LLM call failed'))

                content = response['choices'][0]['message']['content']
                return {
                    'text': content,
                    'node_id': node['id'],
                    'generation_time_ms': int((time.time() - start_time) * 1000)
                }

            else:
                raise ValueError(f"Unknown node type: {node_type}")

        except Exception as e:
            raise ValueError(f"Node execution failed: {str(e)}")

    @staticmethod
    def _execute_node_in_thread(app, node, input_data, user_id, result_dict, node_id):
        """
        Execute a node inside a thread with Flask app context.
        Results are stored in result_dict for thread-safe collection.

        Args:
            app: Flask app instance for context
            node: Node configuration
            input_data: List of input data (images or text)
            user_id: User ID
            result_dict: Shared dictionary to store results
            node_id: Node ID for result storage
        """
        with app.app_context():
            try:
                result = WorkflowService.execute_node(node, input_data, user_id)
                result_entry = {
                    'status': 'completed',
                    'node_id': result.get('node_id'),
                    'generation_time_ms': result.get('generation_time_ms', 0)
                }
                # Include image_data if present (imageUpload, imageGen nodes)
                if result.get('image_data'):
                    result_entry['image_data'] = result['image_data']
                # Include image_id if present (imageGen nodes)
                if result.get('image_id'):
                    result_entry['image_id'] = result['image_id']
                # Include text if present (textInput, aiAgent nodes)
                if result.get('text') is not None:
                    result_entry['text'] = result['text']

                result_dict[node_id] = result_entry
            except Exception as e:
                result_dict[node_id] = {
                    'status': 'failed',
                    'error': str(e)
                }

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
            # Build execution layers (nodes in same layer can run in parallel)
            execution_layers = cls.build_execution_graph(nodes, edges)

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

                # Filter execution layers to only include ancestors and start node
                execution_layers = [
                    [node_id for node_id in layer if node_id in ancestors]
                    for layer in execution_layers
                ]
                # Remove empty layers
                execution_layers = [layer for layer in execution_layers if layer]

            # Execute nodes layer by layer (parallel within each layer)
            node_results = {}
            nodes_by_id = {node['id']: node for node in nodes}

            print(f"[execute_workflow] Executing {len(execution_layers)} layers")
            for i, layer in enumerate(execution_layers):
                print(f"[execute_workflow] Layer {i}: {layer}")
            print(f"[execute_workflow] Nodes by ID: {list(nodes_by_id.keys())}")

            # Get Flask app for context in greenlets
            app = current_app._get_current_object()

            for layer in execution_layers:
                # Filter valid nodes in this layer
                layer_nodes = [node_id for node_id in layer if node_id in nodes_by_id]
                if not layer_nodes:
                    continue

                # Mark all nodes in layer as running
                for node_id in layer_nodes:
                    WorkflowRunModel.update_node_result(run_id, node_id, {
                        'status': 'running'
                    })

                # Execute nodes in parallel using threads
                threads = []
                layer_results = {}

                for node_id in layer_nodes:
                    node = nodes_by_id[node_id]
                    # Get inputs from predecessor nodes (already completed in previous layers)
                    input_data = cls.get_node_inputs(node_id, edges, node_results)

                    # Spawn thread for parallel execution
                    thread = threading.Thread(
                        target=cls._execute_node_in_thread,
                        args=(app, node, input_data, user_id, layer_results, node_id)
                    )
                    thread.start()
                    threads.append(thread)

                # Wait for all threads in this layer to complete
                for t in threads:
                    t.join()

                # Process results from this layer
                failed_node = None
                for node_id, result in layer_results.items():
                    node_results[node_id] = result

                    # Update node result in database
                    WorkflowRunModel.update_node_result(run_id, node_id, {
                        **result,
                        'completed_at': datetime.utcnow()
                    })

                    # Track if any node failed
                    if result['status'] == 'failed' and failed_node is None:
                        failed_node = (node_id, result.get('error', 'Unknown error'))

                # If any node in this layer failed, stop execution
                if failed_node:
                    WorkflowRunModel.update_status(run_id, 'failed')
                    run = WorkflowRunModel.get_by_id(run_id)
                    return {
                        'run_id': run_id,
                        'status': 'failed',
                        'node_results': node_results,
                        'error': f"Node {failed_node[0]} failed: {failed_node[1]}",
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
        Execute only a single node using existing inputs from connected nodes.
        Does NOT re-execute ancestor nodes - uses their existing outputs.
        Supports image nodes (imageUpload, imageGen) and text nodes (textInput, aiAgent).

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

        # Get inputs from connected predecessor nodes using their existing data
        input_data = []
        print(f"[execute_single_node] Target node: {node_id}, type: {target_node['type']}")
        print(f"[execute_single_node] Target node data: {target_node.get('data', {})}")

        for edge in edges:
            if edge['target'] == node_id:
                source_id = edge['source']
                if source_id in nodes_by_id:
                    source_node = nodes_by_id[source_id]
                    source_data = source_node.get('data', {})
                    source_type = source_node['type']
                    print(f"[execute_single_node] Source node: {source_id}, type: {source_type}")
                    print(f"[execute_single_node] Source node data keys: {source_data.keys()}")

                    # Check for existing data based on node type
                    data = None
                    if source_type == 'imageUpload':
                        data = source_data.get('imageUrl')
                    elif source_type == 'imageGen':
                        data = source_data.get('generatedImage')
                    elif source_type == 'textInput':
                        data = source_data.get('text', '')
                        print(f"[execute_single_node] TextInput data: '{data}'")
                    elif source_type == 'aiAgent':
                        data = source_data.get('generatedText')
                        print(f"[execute_single_node] AIAgent generatedText: '{data[:100] if data else None}'...")

                    if data is not None and data != '':
                        input_data.append(data)
                    elif source_type in ('imageUpload', 'imageGen'):
                        # Image nodes require data
                        raise ValueError(
                            f"Input node '{source_id}' has no image. "
                            "Please run it first or upload an image."
                        )
                    elif source_type == 'aiAgent' and data is None:
                        # aiAgent nodes require generated text
                        raise ValueError(
                            f"Input node '{source_id}' has no generated text. "
                            "Please run it first."
                        )

        # Execute the single node
        try:
            result = cls.execute_node(target_node, input_data, user_id)
            response = {
                'status': 'completed',
                'node_id': node_id,
                'generation_time_ms': result.get('generation_time_ms', 0)
            }
            # Include image_data if present
            if result.get('image_data'):
                response['image_data'] = result['image_data']
            # Include image_id if present
            if result.get('image_id'):
                response['image_id'] = result['image_id']
            # Include text if present
            if result.get('text') is not None:
                response['text'] = result['text']
            return response
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
