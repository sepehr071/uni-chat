"""
Workflow execution service for image generation workflows.
Handles topological sorting, node execution, and workflow runs.
"""
import base64
import time
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from collections import deque, defaultdict
from bson import ObjectId
from flask import current_app
from app.utils.network import validate_external_https

from app.models.workflow import WorkflowModel
from app.models.workflow_run import WorkflowRunModel
from app.models.generated_image import GeneratedImageModel
from app.models.generated_audio import GeneratedAudioModel
from app.models.generated_video import GeneratedVideoModel
from app.models.user import UserModel
from app.models.knowledge_item import KnowledgeItemModel
from app.services.openrouter_service import OpenRouterService
from app.services.dlp_gate import gate as dlp_gate

_BRAND_BRIEF_CHAR_LIMIT = 8000

# Per-platform character limits for aiAgent output (B3)
PLATFORM_LIMITS = {
    'instagram': 2200,
    'twitter':   280,
    'linkedin':  3000,
    'tiktok':    2200,
    'youtube_description': 5000,
}

# Style preset suffixes appended to imageGen prompt at run time (B4)
_IMAGE_STYLE_SUFFIXES = {
    'photorealistic': 'photorealistic, sharp focus, natural lighting',
    'illustration':   'stylized illustration, clean line work',
    'minimalist':     'minimalist composition, lots of negative space',
    'bold-brand':     'bold brand aesthetic, vibrant color, high contrast',
}

# Aspect-ratio prompt hints — until OpenRouter image API exposes a native size param
_ASPECT_PROMPT_HINTS = {
    '1:1':  '1:1 square framing',
    '9:16': 'vertical 9:16 composition, mobile-first framing',
    '16:9': 'horizontal 16:9 widescreen framing',
    '4:5':  '4:5 portrait framing',
}


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

                    # Append typed media entries at the end so existing
                    # string-only consumers (imageGen, aiAgent) continue to
                    # filter by `isinstance(inp, str)` without seeing them.
                    if result.get('audio_data_uri'):
                        inputs.append({'kind': 'audio', 'url': result['audio_data_uri']})
                        print(f"[get_node_inputs] Added audio input (typed dict)")
                    if result.get('video_url'):
                        inputs.append({'kind': 'video', 'url': result['video_url']})
                        print(f"[get_node_inputs] Added video input (typed dict)")
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

                if not model:
                    raise ValueError("Image generation node missing model")

                # Fall back to connected text inputs if no explicit prompt.
                if not prompt or not prompt.strip():
                    text_inputs = [
                        inp for inp in input_data
                        if isinstance(inp, str)
                        and not inp.startswith('data:image')
                        and not inp.startswith('http')
                    ]
                    prompt = '\n\n'.join(t for t in text_inputs if t)

                if not prompt or not prompt.strip():
                    raise ValueError("Image generation node missing prompt (no data.prompt and no text input)")

                # Append aspect-ratio hint and style-preset suffix to prompt (B4)
                aspect_ratio = node_data.get('aspect_ratio') or '1:1'
                style_preset = node_data.get('style_preset')
                prompt_extras = []
                aspect_hint = _ASPECT_PROMPT_HINTS.get(aspect_ratio)
                if aspect_hint:
                    prompt_extras.append(aspect_hint)
                style_suffix = _IMAGE_STYLE_SUFFIXES.get(style_preset) if style_preset else None
                if style_suffix:
                    prompt_extras.append(style_suffix)
                if prompt_extras:
                    prompt = f"{prompt}. {', '.join(prompt_extras)}"

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
                    input_images=input_images,
                    user_id=user_id,
                    conversation_id=None,
                    feature='workflow'
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

            elif node_type == 'ttsNode':
                # Synthesize speech via OpenRouter TTS.
                # Prefer explicit `text` on the node; fall back to concatenating
                # all string inputs from predecessors (textInput / aiAgent).
                explicit_text = node_data.get('text')
                if explicit_text and explicit_text.strip():
                    text = explicit_text
                else:
                    text_inputs = [inp for inp in input_data if isinstance(inp, str)]
                    text = '\n\n'.join(t for t in text_inputs if t)

                if not text or not text.strip():
                    raise ValueError("TTS node has no text input")

                model = node_data.get('model') or 'openai/gpt-4o-mini-tts-2025-12-15'
                voice = node_data.get('voice') or 'alloy'
                try:
                    speed = float(node_data.get('speed') or 1.0)
                except (TypeError, ValueError):
                    speed = 1.0

                result = OpenRouterService.generate_speech(
                    input=text,
                    model=model,
                    voice=voice,
                    speed=speed,
                    user_id=user_id,
                    conversation_id=None,
                    feature='workflow'
                )

                if not result.get('success'):
                    raise ValueError(result.get('error', 'TTS generation failed'))

                mime = result.get('mime', 'audio/mpeg')
                audio_b64 = base64.b64encode(result['audio_bytes']).decode('ascii')
                audio_data_uri = f"data:{mime};base64,{audio_b64}"

                # Rough duration estimate: ~15 chars/sec at speed=1.0, scaled.
                char_count = len(text)
                duration_ms = int((char_count / 15.0) * 1000.0 / max(speed, 0.01))

                saved_audio = GeneratedAudioModel.create(
                    user_id=user_id,
                    text=text,
                    model=model,
                    voice=voice,
                    speed=speed,
                    mime=mime,
                    audio_data_uri=audio_data_uri,
                    duration_ms=duration_ms,
                    metadata={
                        'workflow_execution': True,
                        'openrouter_generation_id': result.get('generation_id'),
                    },
                )

                return {
                    'audio_data_uri': audio_data_uri,
                    'audio_id': str(saved_audio['_id']),
                    'duration_ms': duration_ms,
                    'node_id': node['id'],
                    'generation_time_ms': int((time.time() - start_time) * 1000),
                }

            elif node_type == 'videoGenNode':
                # Pick the first image-like predecessor as the keyframe, if any.
                frame_url = None
                for inp in input_data:
                    if isinstance(inp, str) and (inp.startswith('data:image') or inp.startswith('http')):
                        frame_url = inp
                        break
                    if isinstance(inp, dict) and inp.get('kind') == 'image' and inp.get('url'):
                        frame_url = inp['url']
                        break

                # Validate frame_url is an external HTTPS URL (SSRF guard)
                if frame_url and not frame_url.startswith('data:image'):
                    ok, reason = validate_external_https(frame_url)
                    if not ok:
                        raise ValueError(f"frame_url_blocked: {reason}")

                frame_images = (
                    [{
                        'type': 'image_url',
                        'image_url': {'url': frame_url},
                        'frame_type': 'first_frame',
                    }] if frame_url else None
                )

                # Prompt: explicit node config wins; else concat text inputs.
                explicit_prompt = node_data.get('prompt')
                if explicit_prompt and explicit_prompt.strip():
                    prompt = explicit_prompt
                else:
                    text_inputs = [inp for inp in input_data if isinstance(inp, str) and not inp.startswith('data:image') and not inp.startswith('http')]
                    prompt = '\n\n'.join(t for t in text_inputs if t)

                if not prompt or not prompt.strip():
                    raise ValueError("Video node has no prompt")

                model = node_data.get('model') or 'google/veo-3.1'
                try:
                    duration = int(node_data.get('duration') or 8)
                except (TypeError, ValueError):
                    duration = 8
                resolution = node_data.get('resolution') or '1080p'
                aspect_ratio = node_data.get('aspect_ratio') or '16:9'
                generate_audio = bool(node_data.get('generate_audio', True))
                seed_raw = node_data.get('seed')
                try:
                    seed = int(seed_raw) if seed_raw is not None and seed_raw != '' else None
                except (TypeError, ValueError):
                    seed = None

                result = OpenRouterService.generate_video(
                    model=model,
                    prompt=prompt,
                    frame_images=frame_images,
                    duration=duration,
                    resolution=resolution,
                    aspect_ratio=aspect_ratio,
                    generate_audio=generate_audio,
                    seed=seed,
                    user_id=user_id,
                )

                if not result.get('success'):
                    raise ValueError(result.get('error', 'Video generation failed'))

                saved_video = GeneratedVideoModel.create(
                    user_id=user_id,
                    prompt=prompt,
                    model=model,
                    local_path=result['local_path'],
                    video_url=result['video_url'],
                    openrouter_generation_id=result.get('generation_id'),
                    duration_sec=result.get('duration_sec'),
                    resolution=result.get('resolution') or resolution,
                    aspect_ratio=aspect_ratio,
                    generate_audio=generate_audio,
                    seed=seed,
                    metadata={
                        'workflow_execution': True,
                        'had_frame_image': frame_url is not None,
                    },
                )

                return {
                    'video_url': result['video_url'],
                    'video_id': str(saved_video['_id']),
                    'duration_sec': result.get('duration_sec'),
                    'resolution': result.get('resolution') or resolution,
                    'node_id': node['id'],
                    'generation_time_ms': int((time.time() - start_time) * 1000),
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
                base_system = node_data.get('system_prompt', '')

                # B1: Brand-brief inject from knowledge folder
                knowledge_folder_id = node_data.get('knowledge_folder_id')
                if knowledge_folder_id:
                    try:
                        from app.models.knowledge_folder import KnowledgeFolderModel
                        folder = KnowledgeFolderModel.find_by_id(str(knowledge_folder_id))
                        if folder is None:
                            print(f"[aiAgent] WARNING: knowledge folder {knowledge_folder_id} not found, skipping injection")
                        else:
                            # Auth check: folder must be owned by this user OR share a project with the workflow.
                            folder_owner = folder.get('user_id')
                            user_oid = ObjectId(user_id) if isinstance(user_id, str) else user_id
                            folder_project_id = folder.get('project_id')
                            workflow_project_id = node_data.get('_workflow_project_id')
                            is_owner = folder_owner and str(folder_owner) == str(user_oid)
                            is_same_project = (
                                folder_project_id is not None
                                and workflow_project_id is not None
                                and str(folder_project_id) == str(workflow_project_id)
                            )
                            if not (is_owner or is_same_project):
                                print(f"[aiAgent] WARNING: knowledge folder {knowledge_folder_id} unauthorized for user {user_id}, skipping injection")
                            else:
                                items, _ = KnowledgeItemModel.find_by_user(
                                    user_id=str(user_oid),
                                    folder_id=str(knowledge_folder_id),
                                    limit=50,
                                )
                                brief_parts = []
                                for item in items:
                                    title = item.get('title', '').strip()
                                    body = item.get('content', '').strip()
                                    if title and body:
                                        brief_parts.append(f"### {title}\n{body}")
                                    elif body:
                                        brief_parts.append(body)
                                if brief_parts:
                                    brief_text = '\n\n'.join(brief_parts)
                                    truncated = False
                                    if len(brief_text) > _BRAND_BRIEF_CHAR_LIMIT:
                                        brief_text = brief_text[:_BRAND_BRIEF_CHAR_LIMIT]
                                        truncated = True
                                    print(
                                        f"[aiAgent] Brand brief: {len(brief_text)} chars, "
                                        f"items={len(items)}, truncated={truncated}"
                                    )
                                    brief_block = f"<BRAND_BRIEF>\n{brief_text}"
                                    if truncated:
                                        brief_block += "\n[brand brief truncated]"
                                    brief_block += "\n</BRAND_BRIEF>"
                                    folder_name = folder.get('name', 'unnamed')
                                    base_system = f"{brief_block}\n\n{base_system}" if base_system else brief_block
                                    print(f"[aiAgent] Injected {len(brief_parts)} knowledge items from folder '{folder_name}'")
                                else:
                                    print(f"[aiAgent] WARNING: knowledge folder {knowledge_folder_id} is empty, skipping injection")
                    except Exception as brief_err:
                        print(f"[aiAgent] WARNING: failed to load brand brief from folder "
                              f"{knowledge_folder_id}: {brief_err}")
                        # Skip injection — do NOT fail the node

                enhanced_system = OpenRouterService.build_enhanced_system_prompt(
                    base_system,
                    ai_prefs
                )
                print(f"[aiAgent] System prompt: {enhanced_system[:200] if enhanced_system else 'NONE'}...")

                # Get model from node config
                model = node_data.get('model')
                print(f"[aiAgent] Model: {model}")
                if not model:
                    raise ValueError("AI Agent node missing model configuration")

                # B3: Platform preset — soft-truncate output to platform char limit
                platform_preset = (node_data.get('platform_preset') or '').lower()

                def _apply_platform_limit(text):
                    limit = PLATFORM_LIMITS.get(platform_preset)
                    if limit and len(text) > limit * 1.1:
                        print(f"[aiAgent] Truncated platform output: {len(text)} -> {limit} chars for platform '{platform_preset}'")
                        return text[:limit]
                    return text

                # B2: Multi-variant generation
                try:
                    variants_count = max(1, min(10, int(node_data.get('variants', 1) or 1)))
                except (TypeError, ValueError):
                    variants_count = 1

                base_temperature = float(node_data.get('temperature', 0.7) or 0.7)
                base_max_tokens = node_data.get('max_tokens', 2048)

                print(f"[aiAgent] variants={variants_count}, base_temperature={base_temperature}")

                def _single_call(idx: int) -> str:
                    temperature = min(base_temperature + idx * 0.1, 1.0)
                    resp = OpenRouterService.chat_completion(
                        messages=[{'role': 'user', 'content': user_prompt}],
                        model=model,
                        system_prompt=enhanced_system,
                        temperature=temperature,
                        max_tokens=base_max_tokens,
                        stream=False,
                        user_id=user_id,
                        conversation_id=None,
                        feature='workflow',
                    )
                    if 'error' in resp:
                        raise ValueError(resp['error'].get('message', 'LLM call failed'))
                    raw = resp['choices'][0]['message']['content']
                    return _apply_platform_limit(raw)

                if variants_count == 1:
                    content = _single_call(0)
                    return {
                        'text': content,
                        'node_id': node['id'],
                        'generation_time_ms': int((time.time() - start_time) * 1000),
                    }
                else:
                    # Concurrent variant calls — ThreadPoolExecutor is safe here
                    # because _execute_node_in_thread already runs inside app_context().
                    variant_texts = [None] * variants_count
                    errors = []
                    max_workers = min(variants_count, 8)
                    with ThreadPoolExecutor(max_workers=max_workers) as pool:
                        future_to_idx = {pool.submit(_single_call, i): i for i in range(variants_count)}
                        for future in as_completed(future_to_idx):
                            idx = future_to_idx[future]
                            try:
                                variant_texts[idx] = future.result()
                            except Exception as ve:
                                print(f"[aiAgent] WARNING: variant {idx} failed: {ve}")
                                errors.append((idx, str(ve)))

                    successes = [t for t in variant_texts if t is not None]
                    if not successes:
                        raise ValueError(f"All {variants_count} variant calls failed. Last error: {errors[-1][1]}")

                    # Replace None slots with empty string so indices stay stable
                    variant_texts = [t if t is not None else '' for t in variant_texts]
                    # text = first non-empty variant (backward compat for downstream nodes)
                    first_text = next(t for t in variant_texts if t)

                    print(f"[aiAgent] variants complete: {len(successes)}/{variants_count} succeeded")
                    return {
                        'text': first_text,
                        'text_variants': variant_texts,
                        'node_id': node['id'],
                        'generation_time_ms': int((time.time() - start_time) * 1000),
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
                # Include text_variants if present (aiAgent multi-variant, B2)
                if result.get('text_variants') is not None:
                    result_entry['text_variants'] = result['text_variants']
                # Include audio if present (ttsNode)
                if result.get('audio_data_uri'):
                    result_entry['audio_data_uri'] = result['audio_data_uri']
                if result.get('audio_id'):
                    result_entry['audio_id'] = result['audio_id']
                if result.get('duration_ms') is not None:
                    result_entry['duration_ms'] = result['duration_ms']
                # Include video if present (videoGenNode)
                if result.get('video_url'):
                    result_entry['video_url'] = result['video_url']
                if result.get('video_id'):
                    result_entry['video_id'] = result['video_id']
                if result.get('duration_sec') is not None:
                    result_entry['duration_sec'] = result['duration_sec']
                if result.get('resolution'):
                    result_entry['resolution'] = result['resolution']

                result_dict[node_id] = result_entry
            except Exception as e:
                result_dict[node_id] = {
                    'status': 'failed',
                    'error': str(e)
                }

    @classmethod
    def execute_workflow(cls, workflow_id, user_id, execution_mode='full', start_node_id=None, dlp_confirmed=False):
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

        # DLP gate — scan static user-input on textInput / aiAgent nodes before
        # any LLM call. Block / require_confirm raise DLPBlockedError, propagated
        # to the route handler.
        workflow_workspace_id = workflow.get('workspace_id')
        user_doc = UserModel.find_by_id(user_id)
        if not workflow_workspace_id and user_doc:
            workflow_workspace_id = user_doc.get('active_workspace_id')
        workflow_project_id = workflow.get('project_id')
        user_lang = 'en'
        if user_doc:
            user_lang = (
                user_doc.get('ai_preferences', {}).get('user_info', {}).get('language', 'en')
                or 'en'
            )[:2].lower()
        for n in nodes:
            n_type = n.get('type')
            n_data = n.get('data', {}) or {}
            if n_type == 'textInput':
                _scan_text = n_data.get('text') or ''
            elif n_type == 'aiAgent':
                _scan_text = n_data.get('user_prompt_template') or ''
            else:
                continue
            if not _scan_text:
                continue
            dlp_gate(
                text=_scan_text,
                user_id=user_id,
                workspace_id=workflow_workspace_id,
                project_id=workflow_project_id,
                source='workflow',
                source_ref={
                    'workflow_id': workflow_id,
                    'node_id': n.get('id'),
                },
                confirmed=dlp_confirmed,
                user_lang=user_lang,
            )

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
                    elif source_type == 'ttsNode':
                        audio_uri = source_data.get('audioDataUri')
                        if audio_uri:
                            data = {'kind': 'audio', 'url': audio_uri}
                    elif source_type == 'videoGenNode':
                        video_url = source_data.get('videoUrl')
                        if video_url:
                            data = {'kind': 'video', 'url': video_url}

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
                    elif source_type == 'ttsNode' and data is None:
                        raise ValueError(
                            f"Input node '{source_id}' has no generated audio. "
                            "Please run it first."
                        )
                    elif source_type == 'videoGenNode' and data is None:
                        raise ValueError(
                            f"Input node '{source_id}' has no generated video. "
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
            # Include text_variants if present (aiAgent multi-variant, B2)
            if result.get('text_variants') is not None:
                response['text_variants'] = result['text_variants']
            # Include audio if present (ttsNode)
            if result.get('audio_data_uri'):
                response['audio_data_uri'] = result['audio_data_uri']
            if result.get('audio_id'):
                response['audio_id'] = result['audio_id']
            if result.get('duration_ms') is not None:
                response['duration_ms'] = result['duration_ms']
            # Include video if present (videoGenNode)
            if result.get('video_url'):
                response['video_url'] = result['video_url']
            if result.get('video_id'):
                response['video_id'] = result['video_id']
            if result.get('duration_sec') is not None:
                response['duration_sec'] = result['duration_sec']
            if result.get('resolution'):
                response['resolution'] = result['resolution']
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
