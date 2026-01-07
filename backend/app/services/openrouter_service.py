import time
import requests
import json
import re
from flask import current_app
from typing import Generator, Optional, List, Dict


class OpenRouterService:
    """Service for interacting with OpenRouter API"""

    BASE_URL = 'https://openrouter.ai/api/v1'

    # Models known to support image generation
    IMAGE_GENERATION_MODELS = [
        'bytedance-seed/seedream-4.5',
        'black-forest-labs/flux.2-flex',
    ]

    # Maximum reference images supported by each model
    IMAGE_GENERATION_LIMITS = {
        'bytedance-seed/seedream-4.5': 14,
        'black-forest-labs/flux.2-flex': 5,
    }

    # Models that support vision (image input) - fetched from OpenRouter API
    # Last updated: 2025-01 via GET /api/v1/models?input_modalities=image
    VISION_MODELS = [
        # OpenAI
        'openai/gpt-4-vision-preview',
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'openai/gpt-4.1',
        'openai/gpt-4.1-mini',
        'openai/gpt-5.1',
        'openai/gpt-5.1-chat',
        'openai/gpt-5.1-codex',
        'openai/gpt-5.1-codex-mini',
        'openai/gpt-5.1-codex-max',
        'openai/gpt-5.2',
        'openai/gpt-5.2-chat',
        'openai/gpt-5.2-pro',
        'openai/gpt-5-image',
        'openai/gpt-5-image-mini',
        'openai/gpt-oss-safeguard-20b',
        'openai/o3-deep-research',
        'openai/o4-mini-deep-research',
        # Anthropic
        'anthropic/claude-3-opus',
        'anthropic/claude-3-sonnet',
        'anthropic/claude-3-haiku',
        'anthropic/claude-3.5-sonnet',
        'anthropic/claude-3.5-haiku',
        'anthropic/claude-3.5-opus',
        'anthropic/claude-sonnet-4',
        'anthropic/claude-haiku-4',
        'anthropic/claude-opus-4',
        'anthropic/claude-opus-4.5',
        'anthropic/claude-haiku-4.5',
        # Google
        'google/gemini-pro-vision',
        'google/gemini-1.5-pro',
        'google/gemini-1.5-flash',
        'google/gemini-2.0-flash',
        'google/gemini-2.5-flash',
        'google/gemini-2.5-pro',
        'google/gemini-2.5-flash-image',
        'google/gemini-3-flash-preview',
        'google/gemini-3-pro-preview',
        'google/gemini-3-pro-image-preview',
        # xAI
        'x-ai/grok-2-vision',
        'x-ai/grok-2-vision-1212',
        'x-ai/grok-4.1-fast',
        # Qwen
        'qwen/qwen3-vl-32b-instruct',
        'qwen/qwen3-vl-8b-thinking',
        'qwen/qwen3-vl-8b-instruct',
        # DeepSeek
        'deepseek/deepseek-v3.2',
        'deepseek/deepseek-v3.2-speciale',
        # Mistral
        'mistralai/mistral-small-creative',
        'mistralai/mistral-large-2512',
        'mistralai/ministral-14b-2512',
        'mistralai/ministral-8b-2512',
        'mistralai/ministral-3b-2512',
        'mistralai/devstral-2512',
        'mistralai/devstral-2512:free',
        'mistralai/voxtral-small-24b-2507',
        # NVIDIA
        'nvidia/nemotron-3-nano-30b-a3b',
        'nvidia/nemotron-3-nano-30b-a3b:free',
        'nvidia/nemotron-nano-12b-v2-vl',
        'nvidia/nemotron-nano-12b-v2-vl:free',
        'nvidia/llama-3.3-nemotron-super-49b-v1.5',
        # Amazon
        'amazon/nova-2-lite-v1',
        'amazon/nova-premier-v1',
        # Other providers
        'bytedance-seed/seed-1.6',
        'bytedance-seed/seed-1.6-flash',
        'minimax/minimax-m2',
        'minimax/minimax-m2.1',
        'z-ai/glm-4.6v',
        'z-ai/glm-4.7',
        'moonshotai/kimi-k2-thinking',
        'perplexity/sonar-pro-search',
        'baidu/ernie-4.5-21b-a3b-thinking',
        'allenai/olmo-3-7b-instruct',
        'allenai/olmo-3-7b-think',
        'allenai/olmo-3-32b-think',
        'allenai/olmo-3.1-32b-think',
        'xiaomi/mimo-v2-flash:free',
        'liquid/lfm2-8b-a1b',
        'liquid/lfm-2.2-6b',
        'ibm-granite/granite-4.0-h-micro',
        'arcee-ai/trinity-mini',
        'arcee-ai/trinity-mini:free',
        'prime-intellect/intellect-3',
        'deepcogito/cogito-v2.1-671b',
        'deepcogito/cogito-v2-preview-llama-405b',
        'kwaipilot/kat-coder-pro',
        'kwaipilot/kat-coder-pro:free',
        'tngtech/tng-r1t-chimera',
        'tngtech/tng-r1t-chimera:free',
        'nex-agi/deepseek-v3.1-nex-n1:free',
        'essentialai/rnj-1-instruct',
        'relace/relace-search',
        'openrouter/bodybuilder',
    ]

    # Cache for dynamic model capabilities
    _vision_models_cache = None
    _cache_timestamp = 0

    @staticmethod
    def get_api_key():
        return current_app.config.get('OPENROUTER_API_KEY', '')

    @staticmethod
    def get_headers():
        base_url = current_app.config.get('BASE_URL', '')
        return {
            'Authorization': f'Bearer {OpenRouterService.get_api_key()}',
            'Content-Type': 'application/json',
            'HTTP-Referer': base_url,
            'X-Title': current_app.config.get('APP_NAME', 'Uni-Chat')
        }

    @staticmethod
    def get_available_models() -> List[Dict]:
        """Fetch available models from OpenRouter"""
        try:
            response = requests.get(
                f'{OpenRouterService.BASE_URL}/models',
                headers=OpenRouterService.get_headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return data.get('data', [])
        except Exception as e:
            print(f"Error fetching models: {e}")
            return []

    @staticmethod
    def get_model_info(model_id: str) -> Optional[Dict]:
        """Get info for a specific model"""
        models = OpenRouterService.get_available_models()
        for model in models:
            if model.get('id') == model_id:
                return model
        return None

    @staticmethod
    def get_models_by_modality(input_modality: Optional[str] = None, output_modality: Optional[str] = None) -> List[Dict]:
        """
        Fetch models filtered by input/output modalities from OpenRouter API

        Args:
            input_modality: Filter by input type (e.g., 'image', 'audio', 'video')
            output_modality: Filter by output type (e.g., 'image', 'embeddings')

        Returns:
            List of model dicts matching the criteria
        """
        try:
            params = []
            if input_modality:
                params.append(f'input_modalities={input_modality}')
            if output_modality:
                params.append(f'output_modalities={output_modality}')

            query_string = '&'.join(params) if params else ''
            url = f'{OpenRouterService.BASE_URL}/models'
            if query_string:
                url += f'?{query_string}'

            response = requests.get(
                url,
                headers=OpenRouterService.get_headers(),
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            return data.get('data', [])
        except Exception as e:
            print(f"Error fetching models by modality: {e}")
            return []

    @staticmethod
    def check_model_supports_vision(model_id: str) -> bool:
        """
        Check if a model supports image input by querying its capabilities
        Uses cache to avoid repeated API calls
        """
        import time
        cache_ttl = 3600  # 1 hour cache

        # Check cache first
        if (OpenRouterService._vision_models_cache is not None and
            time.time() - OpenRouterService._cache_timestamp < cache_ttl):
            return model_id in OpenRouterService._vision_models_cache

        # Fallback to static list if can't refresh
        try:
            vision_models = OpenRouterService.get_models_by_modality(input_modality='image')
            OpenRouterService._vision_models_cache = set(m.get('id') for m in vision_models)
            OpenRouterService._cache_timestamp = time.time()
            return model_id in OpenRouterService._vision_models_cache
        except Exception:
            # Fallback to static list
            return model_id in OpenRouterService.VISION_MODELS

    @staticmethod
    def chat_completion(
        messages: List[Dict],
        model: str,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 1.0,
        frequency_penalty: float = 0.0,
        presence_penalty: float = 0.0,
        stream: bool = False
    ):
        """
        Send a chat completion request to OpenRouter

        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model ID (e.g., 'openai/gpt-4', 'anthropic/claude-3-opus')
            system_prompt: Optional system prompt to prepend
            temperature: Sampling temperature (0.0 - 2.0)
            max_tokens: Maximum tokens in response
            top_p: Nucleus sampling parameter
            frequency_penalty: Frequency penalty (-2.0 to 2.0)
            presence_penalty: Presence penalty (-2.0 to 2.0)
            stream: Whether to stream the response

        Returns:
            If stream=False: dict with response
            If stream=True: Generator yielding chunks
        """
        # Build messages list
        full_messages = []

        # Add system prompt if provided
        if system_prompt:
            full_messages.append({
                'role': 'system',
                'content': system_prompt
            })

        # Add conversation messages
        full_messages.extend(messages)

        payload = {
            'model': model,
            'messages': full_messages,
            'temperature': temperature,
            'max_tokens': max_tokens,
            'top_p': top_p,
            'frequency_penalty': frequency_penalty,
            'presence_penalty': presence_penalty,
            'stream': stream
        }

        if stream:
            return OpenRouterService._stream_completion(payload)
        else:
            return OpenRouterService._sync_completion(payload)

    @staticmethod
    def _sync_completion(payload: Dict) -> Dict:
        """Non-streaming completion"""
        try:
            response = requests.post(
                f'{OpenRouterService.BASE_URL}/chat/completions',
                headers=OpenRouterService.get_headers(),
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            return response.json()
        except requests.exceptions.HTTPError as e:
            error_data = e.response.json() if e.response else {}
            return {
                'error': {
                    'message': error_data.get('error', {}).get('message', str(e)),
                    'code': e.response.status_code if e.response else 500
                }
            }
        except Exception as e:
            return {
                'error': {
                    'message': str(e),
                    'code': 500
                }
            }

    @staticmethod
    def _stream_completion(payload: Dict) -> Generator:
        """Streaming completion - yields chunks"""
        try:
            response = requests.post(
                f'{OpenRouterService.BASE_URL}/chat/completions',
                headers=OpenRouterService.get_headers(),
                json=payload,
                stream=True,
                timeout=120
            )
            response.raise_for_status()

            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    # Skip SSE comments (keep-alive signals from OpenRouter)
                    if line.startswith(':'):
                        continue
                    if line.startswith('data: '):
                        data = line[6:]  # Remove 'data: ' prefix
                        if data == '[DONE]':
                            yield {'done': True}
                            break
                        try:
                            chunk = json.loads(data)
                            yield chunk
                            time.sleep(0)  # Yield control between chunks for smoother streaming
                        except json.JSONDecodeError:
                            continue

        except requests.exceptions.HTTPError as e:
            error_data = {}
            try:
                error_data = e.response.json() if e.response else {}
            except (ValueError, AttributeError):
                pass
            yield {
                'error': {
                    'message': error_data.get('error', {}).get('message', str(e)),
                    'code': e.response.status_code if e.response else 500
                }
            }
        except Exception as e:
            yield {
                'error': {
                    'message': str(e),
                    'code': 500
                }
            }

    @staticmethod
    def format_messages_for_api(messages: List[Dict]) -> List[Dict]:
        """
        Format messages from database format to API format

        Args:
            messages: List of message documents from database

        Returns:
            List of messages in OpenRouter API format
        """
        formatted = []
        for msg in messages:
            # Skip error messages
            if msg.get('is_error'):
                continue

            formatted_msg = {
                'role': msg['role'],
                'content': msg['content']
            }

            # Handle attachments (images for multimodal models)
            attachments = msg.get('attachments', [])
            if attachments:
                content_parts = [{'type': 'text', 'text': msg['content']}]
                for attachment in attachments:
                    # Check for image attachment (type can be 'image' or MIME type like 'image/jpeg')
                    att_type = attachment.get('type', '')
                    mime_type = attachment.get('mime_type', '')
                    is_image = (
                        att_type == 'image' or
                        att_type.startswith('image/') or
                        mime_type.startswith('image/')
                    )
                    if is_image and attachment.get('url'):
                        content_parts.append({
                            'type': 'image_url',
                            'image_url': {'url': attachment['url']}
                        })
                formatted_msg['content'] = content_parts

            formatted.append(formatted_msg)

        return formatted

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """
        Rough estimation of token count
        Average English word is ~4 characters, ~1.3 tokens
        """
        if not text:
            return 0
        # Rough estimate: 4 chars per token
        return len(text) // 4

    @staticmethod
    def calculate_cost(model_id: str, prompt_tokens: int, completion_tokens: int) -> float:
        """
        Calculate estimated cost based on model pricing
        Note: Prices may vary, this is an approximation
        """
        # This would need to be updated with actual OpenRouter pricing
        # Using placeholder values
        pricing = {
            'openai/gpt-4': {'prompt': 0.03, 'completion': 0.06},
            'openai/gpt-4-turbo': {'prompt': 0.01, 'completion': 0.03},
            'openai/gpt-3.5-turbo': {'prompt': 0.0005, 'completion': 0.0015},
            'anthropic/claude-3-opus': {'prompt': 0.015, 'completion': 0.075},
            'anthropic/claude-3-sonnet': {'prompt': 0.003, 'completion': 0.015},
            'anthropic/claude-3-haiku': {'prompt': 0.00025, 'completion': 0.00125},
        }

        model_pricing = pricing.get(model_id, {'prompt': 0.001, 'completion': 0.002})

        prompt_cost = (prompt_tokens / 1000) * model_pricing['prompt']
        completion_cost = (completion_tokens / 1000) * model_pricing['completion']

        return prompt_cost + completion_cost

    @staticmethod
    def detect_images_in_content(content: str) -> List[Dict]:
        """
        Detect image URLs and base64 images in content

        Returns list of detected images with their URLs
        """
        if not content:
            return []

        images = []

        # Pattern for markdown images: ![alt](url)
        markdown_pattern = r'!\[([^\]]*)\]\(([^)]+)\)'
        for match in re.finditer(markdown_pattern, content):
            alt_text = match.group(1)
            url = match.group(2)
            images.append({
                'type': 'markdown',
                'url': url,
                'alt': alt_text,
                'position': match.start()
            })

        # Pattern for direct image URLs
        url_pattern = r'https?://[^\s<>"\']+\.(?:png|jpg|jpeg|gif|webp|svg)(?:\?[^\s<>"\']*)?'
        for match in re.finditer(url_pattern, content, re.IGNORECASE):
            url = match.group(0)
            # Skip if already found in markdown
            if not any(img['url'] == url for img in images):
                images.append({
                    'type': 'url',
                    'url': url,
                    'alt': '',
                    'position': match.start()
                })

        # Pattern for base64 data URIs
        base64_pattern = r'data:image/[^;]+;base64,[a-zA-Z0-9+/=]+'
        for match in re.finditer(base64_pattern, content):
            images.append({
                'type': 'base64',
                'url': match.group(0),
                'alt': 'Generated image',
                'position': match.start()
            })

        return sorted(images, key=lambda x: x['position'])

    @staticmethod
    def generate_title(first_message: str, model: str = 'x-ai/grok-4.1-fast') -> str:
        """Generate a conversation title from the first message using LLM"""
        prompt = f"""Generate a short, descriptive title (max 6 words) for a conversation that starts with this message. Return ONLY the title, no quotes or extra text.

Message: {first_message[:500]}"""

        response = OpenRouterService._sync_completion({
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 30,
            'temperature': 0.7
        })

        if 'error' not in response:
            try:
                title = response['choices'][0]['message']['content'].strip()
                # Remove quotes if present
                title = title.strip('"\'')
                return title[:50] if title else first_message[:50]
            except (KeyError, IndexError):
                pass
        return first_message[:50]  # Fallback to truncated message

    @staticmethod
    def is_image_generation_model(model_id: str) -> bool:
        """Check if a model supports image generation"""
        return model_id in OpenRouterService.IMAGE_GENERATION_MODELS

    @staticmethod
    def is_vision_model(model_id: str) -> bool:
        """Check if a model supports image input (vision)"""
        # First check static list for fast response
        if model_id in OpenRouterService.VISION_MODELS:
            return True
        # Try dynamic check for models not in static list
        try:
            return OpenRouterService.check_model_supports_vision(model_id)
        except Exception:
            return False

    @staticmethod
    def get_model_capabilities(model_id: str) -> Dict:
        """Get capabilities for a model"""
        return {
            'supports_vision': OpenRouterService.is_vision_model(model_id),
            'supports_image_generation': OpenRouterService.is_image_generation_model(model_id),
        }

    @staticmethod
    def get_image_capable_models() -> List[Dict]:
        """Get available image generation models"""
        return [
            {
                'id': 'bytedance-seed/seedream-4.5',
                'name': 'ByteDance Seedream 4.5',
                'description': 'Supports up to 14 reference images, 2048x2048 max resolution',
                'pricing': {'image': '0.04'}
            },
            {
                'id': 'black-forest-labs/flux.2-flex',
                'name': 'Black Forest Labs FLUX.2 Flex',
                'description': 'Supports up to 5 reference images, 4MP resolution',
                'pricing': {'image': 'varies'}
            }
        ]

    @staticmethod
    def generate_image(
        prompt: str,
        model: str,
        negative_prompt: Optional[str] = None,
        input_images: Optional[List[str]] = None
    ) -> Dict:
        """Generate an image using OpenRouter API

        Args:
            prompt: Text prompt for image generation
            model: Model ID to use
            negative_prompt: Optional negative prompt
            input_images: Optional list of base64 data URIs or URLs for image-to-image

        Returns:
            Dict with success, image_data, and usage information
        """
        # Validate input images count
        if input_images:
            max_images = OpenRouterService.IMAGE_GENERATION_LIMITS.get(model, 0)
            if len(input_images) > max_images:
                return {
                    'success': False,
                    'error': f'Model {model} supports maximum {max_images} input images'
                }

            # Validate image format
            for img in input_images:
                if not img.startswith('data:image/') and not img.startswith('http'):
                    return {
                        'success': False,
                        'error': 'Invalid image format. Must be base64 data URI or URL'
                    }

        # Build prompt with negative prompt if provided
        full_prompt = prompt
        if negative_prompt:
            full_prompt = f"{prompt}\n\nNegative prompt: {negative_prompt}"

        # Build message content
        if input_images and len(input_images) > 0:
            # Multi-part content array for image-to-image
            content_parts = [{'type': 'text', 'text': full_prompt}]
            for img in input_images:
                content_parts.append({
                    'type': 'image_url',
                    'image_url': {'url': img}
                })
            messages = [{'role': 'user', 'content': content_parts}]
        else:
            # Simple text-only prompt for text-to-image
            messages = [{'role': 'user', 'content': full_prompt}]

        payload = {
            'model': model,
            'messages': messages,
            'modalities': ['image', 'text']
        }

        try:
            response = requests.post(
                f'{OpenRouterService.BASE_URL}/chat/completions',
                headers=OpenRouterService.get_headers(),
                json=payload,
                timeout=120
            )
            response.raise_for_status()
            data = response.json()

            # Extract image from response
            choices = data.get('choices', [])
            if choices:
                message = choices[0].get('message', {})
                images = message.get('images', [])
                if images:
                    return {
                        'success': True,
                        'image_data': images[0].get('image_url', {}).get('url', ''),
                        'usage': data.get('usage', {})
                    }
                # Some models return image in content
                content = message.get('content', '')
                if content.startswith('data:image'):
                    return {
                        'success': True,
                        'image_data': content,
                        'usage': data.get('usage', {})
                    }

            return {'success': False, 'error': 'No image in response'}
        except requests.exceptions.HTTPError as e:
            error_data = {}
            try:
                error_data = e.response.json() if e.response else {}
            except (ValueError, AttributeError):
                pass
            return {
                'success': False,
                'error': error_data.get('error', {}).get('message', str(e))
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}
