"""
Workflow AI Generation Route
Generates workflows from natural language descriptions using LLM
"""
import json
import re
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app.services.openrouter_service import OpenRouterService
from app.services.model_registry_service import ModelRegistryService

workflow_ai_bp = Blueprint('workflow_ai', __name__)

# Comprehensive context about the workflow system for the LLM
WORKFLOW_CONTEXT = """
# Uni-Chat Workflow System

You are generating workflows for an image generation pipeline system. Users describe what they want, and you create the workflow structure.

## Available Node Types

### 1. imageUpload
- **Purpose**: Starting point - user will upload a reference image here
- **Inputs**: None (this is always a source node)
- **Outputs**: 1 image output (handle name: "output")
- **Required data fields**:
  - label: string (descriptive name like "Product Photo", "Style Reference")
- **Use when**: User needs to provide an existing image as input

### 2. imageGen
- **Purpose**: Generate new images using AI models
- **Inputs**: 0-3 reference images (handle names: "input-0", "input-1", "input-2")
- **Outputs**: 1 generated image (handle name: "output")
- **Required data fields**:
  - label: string (descriptive name)
  - model: MUST be one of:
    - "google/gemini-2.5-flash-image" (Nano Banana, fast/cheap, up to 3 reference images, great default)
    - "google/gemini-3.1-flash-image-preview" (Nano Banana 2, Pro-quality at Flash speed, up to 3 refs)
    - "google/gemini-3-pro-image-preview" (Nano Banana Pro, top quality + 1K/2K/4K, up to 14 refs)
    - "openai/gpt-5-image-mini" (efficient OpenAI model, strong text rendering, up to 16 refs)
    - "openai/gpt-5-image" (full GPT-5 reasoning + image gen, up to 16 refs)
    - "openai/gpt-5.4-image-2" (latest OpenAI flagship, high-fidelity edits, up to 16 refs)
  - prompt: string (detailed description of what to generate)
  - negativePrompt: string (what to avoid, e.g., "blurry, low quality, distorted")
- **Use when**: Creating new images or transforming existing ones

## Workflow Patterns

### Linear Chain (sequential processing)
```
imageUpload → imageGen → imageGen → imageGen
```
Use for: Multi-step refinement, progressive enhancement

### Fan-Out (one input, multiple outputs)
```
imageUpload → imageGen (variation 1)
            → imageGen (variation 2)
            → imageGen (variation 3)
```
Use for: Creating multiple variations, social media packs, A/B testing

### Fan-In (multiple inputs, one output)
```
imageUpload (product) ──┐
imageUpload (style)  ───┼→ imageGen (combined result)
imageUpload (scene)  ───┘
```
Use for: Style transfer, compositing, combining multiple references

### Complex (combination of patterns)
```
imageUpload ──┬→ imageGen (style A) ──┬→ imageGen (final blend)
              └→ imageGen (style B) ──┘
```

## Node Positioning Rules
- First column (imageUpload nodes): x = 100
- Each subsequent column: x += 350
- Vertical spacing between nodes: 200
- Center the workflow vertically, start around y = 200-300
- For fan-out: spread output nodes vertically
- For fan-in: align input nodes vertically, output centered

## Connection Rules
- Edge source is always the "output" handle
- Edge target is "input-0", "input-1", or "input-2"
- imageUpload can only be a SOURCE (no incoming edges)
- imageGen can have 0-3 incoming edges and 1 outgoing edge
- NO CYCLES - the workflow must be a DAG (directed acyclic graph)
- Use edge IDs like "e1-2" (edge from node-1 to node-2)

## Prompt Writing Guidelines
- Be specific and descriptive
- Include: subject, style, lighting, composition, quality modifiers
- Product photos: "professional product photography, studio lighting, white background, commercial quality"
- Social media: mention the format context (e.g., "Instagram square format", "Twitter banner wide format")
- Artistic: include art style references (e.g., "oil painting style", "digital art", "photorealistic")
- Always include quality terms: "high quality, detailed, sharp focus"
- Negative prompts should include: "blurry, low quality, distorted, artifacts, watermark"

## Output Format
Return ONLY a valid JSON object with this exact structure:
{
  "name": "Workflow Name",
  "description": "Brief description of what this workflow does",
  "nodes": [
    {
      "id": "node-1",
      "type": "imageUpload",
      "position": {"x": 100, "y": 300},
      "data": {"label": "Input Image"}
    },
    {
      "id": "node-2",
      "type": "imageGen",
      "position": {"x": 450, "y": 300},
      "data": {
        "label": "Generated Output",
        "model": "google/gemini-2.5-flash-image",
        "prompt": "detailed prompt here",
        "negativePrompt": "blurry, low quality, distorted"
      }
    }
  ],
  "edges": [
    {
      "id": "e1-2",
      "source": "node-1",
      "target": "node-2",
      "sourceHandle": "output",
      "targetHandle": "input-0"
    }
  ]
}
"""

SYSTEM_PROMPT = """You are a workflow generator for Uni-Chat's image generation system.
Given a user's description, generate a complete and valid workflow JSON.

CRITICAL RULES:
1. Output ONLY valid JSON - no markdown, no explanation, no code blocks
2. Every imageGen node MUST have model, prompt, and negativePrompt in data
3. Model MUST be exactly one of: "google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image-preview", "google/gemini-3-pro-image-preview", "openai/gpt-5-image-mini", "openai/gpt-5-image", "openai/gpt-5.4-image-2"
4. All edges must use sourceHandle: "output" and targetHandle: "input-0" (or input-1, input-2)
5. Node IDs must be unique: node-1, node-2, node-3, etc.
6. Position nodes logically so they don't overlap
7. Write detailed, high-quality prompts for each imageGen node"""


@workflow_ai_bp.route('/generate', methods=['POST'])
@jwt_required()
def generate_workflow():
    """Generate a workflow from natural language description"""
    try:
        user_id = get_jwt_identity()
        data = request.get_json(silent=True) or {}
        description = data.get('description', '').strip()

        if not description:
            return jsonify({'error': 'Description is required'}), 400

        if len(description) > 2000:
            return jsonify({'error': 'Description too long (max 2000 characters)'}), 400

        # Resolve live image-gen models from the registry (falls back gracefully)
        registry = ModelRegistryService()
        image_models = registry.find_by_modality(output=['image']) or []
        image_model_ids = [m['_id'] for m in image_models]
        default_image_model = image_model_ids[0] if image_model_ids else 'google/gemini-2.5-flash-image'

        # Build system prompt with current image model allowlist
        if image_model_ids:
            model_list_str = '\n    - '.join(f'"{m}"' for m in image_model_ids)
            dynamic_system_prompt = SYSTEM_PROMPT.replace(
                'Model MUST be exactly one of: "google/gemini-2.5-flash-image", "google/gemini-3.1-flash-image-preview", "google/gemini-3-pro-image-preview", "openai/gpt-5-image-mini", "openai/gpt-5-image", "openai/gpt-5.4-image-2"',
                f'Model MUST be exactly one of:\n    - {model_list_str}'
            )
        else:
            dynamic_system_prompt = SYSTEM_PROMPT

        # Build the prompt
        user_message = f"""{WORKFLOW_CONTEXT}

---

USER REQUEST: {description}

Generate a workflow that accomplishes this request. Remember:
- Start with imageUpload nodes for any images the user needs to provide
- Use imageGen nodes with detailed prompts
- Position nodes so they don't overlap
- Connect nodes appropriately

Output only the JSON, nothing else."""

        messages = [{"role": "user", "content": user_message}]

        # Call LLM
        response = OpenRouterService.chat_completion(
            messages=messages,
            model="google/gemini-3-flash-preview",
            system_prompt=dynamic_system_prompt,
            temperature=0.1,
            max_tokens=4096,
            stream=False,
            user_id=user_id,
            conversation_id=None,
            feature='workflow_ai'
        )

        # Check for errors
        if 'error' in response:
            return jsonify({
                'error': response['error'].get('message', 'LLM request failed')
            }), 500

        # Extract the content
        content = response.get('choices', [{}])[0].get('message', {}).get('content', '')

        if not content:
            return jsonify({'error': 'No response from LLM'}), 500

        # Clean up the response - remove any markdown code blocks if present
        content = content.strip()
        if content.startswith('```'):
            # Remove markdown code blocks
            content = re.sub(r'^```(?:json)?\n?', '', content)
            content = re.sub(r'\n?```$', '', content)
            content = content.strip()

        # Parse JSON
        try:
            workflow = json.loads(content)
        except json.JSONDecodeError as e:
            print(f"JSON parse error: {e}")
            print(f"Content was: {content[:500]}...")
            return jsonify({
                'error': 'Failed to parse workflow JSON from LLM response'
            }), 500

        # Validate basic structure
        if 'nodes' not in workflow or 'edges' not in workflow:
            return jsonify({
                'error': 'Invalid workflow structure: missing nodes or edges'
            }), 500

        # Ensure all nodes have required fields
        for node in workflow.get('nodes', []):
            if 'id' not in node or 'type' not in node or 'position' not in node:
                return jsonify({
                    'error': f'Invalid node structure: {node}'
                }), 500

            if 'data' not in node:
                node['data'] = {}

            if node['type'] == 'imageGen':
                # Ensure imageGen has required fields
                if 'model' not in node['data']:
                    node['data']['model'] = default_image_model
                if 'prompt' not in node['data']:
                    node['data']['prompt'] = ''
                if 'negativePrompt' not in node['data']:
                    node['data']['negativePrompt'] = 'blurry, low quality, distorted'

        return jsonify({
            'success': True,
            'workflow': workflow
        })

    except Exception as e:
        print(f"Error generating workflow: {str(e)}")
        return jsonify({'error': f'Failed to generate workflow: {str(e)}'}), 500
