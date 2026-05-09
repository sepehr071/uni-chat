import logging
import os
import time
import requests
import json
import re
from flask import current_app
from typing import Generator, Optional, List, Dict

logger = logging.getLogger(__name__)


class OpenRouterService:
    """Service for interacting with OpenRouter API"""

    BASE_URL = 'https://openrouter.ai/api/v1'

    # Fallback constants used when the live model registry is unavailable.
    # Models known to support image generation (verified live on OpenRouter, 2026-04)
    _FALLBACK_IMAGE_GENERATION_MODELS = [
        'google/gemini-2.5-flash-image',
        'google/gemini-3.1-flash-image-preview',
        'google/gemini-3-pro-image-preview',
        'openai/gpt-5-image-mini',
        'openai/gpt-5-image',
        'openai/gpt-5.4-image-2',
    ]

    # Maximum reference images supported by each model.
    # Sources:
    #   - Gemini 2.5 Flash Image: best results with up to 3 images (Google docs).
    #   - Gemini 3.1 Flash Image Preview: same input cap as 2.5 Flash family.
    #   - Gemini 3 Pro Image (Nano Banana Pro): up to 14 standard inputs.
    #   - GPT-5 Image family: OpenAI image edit endpoint accepts up to 16 refs.
    _FALLBACK_IMAGE_GENERATION_LIMITS = {
        'google/gemini-2.5-flash-image': 3,
        'google/gemini-3.1-flash-image-preview': 3,
        'google/gemini-3-pro-image-preview': 14,
        'openai/gpt-5-image-mini': 16,
        'openai/gpt-5-image': 16,
        'openai/gpt-5.4-image-2': 16,
    }

    # Keep public aliases for any callers that still reference the old names.
    IMAGE_GENERATION_MODELS = _FALLBACK_IMAGE_GENERATION_MODELS
    IMAGE_GENERATION_LIMITS = _FALLBACK_IMAGE_GENERATION_LIMITS

    # Fallback list of models that support vision (image input).
    # Last updated: 2025-01 via GET /api/v1/models?input_modalities=image
    _FALLBACK_VISION_MODELS = [
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

    # Public alias for any callers still referencing the old name.
    VISION_MODELS = _FALLBACK_VISION_MODELS

    # Cache for dynamic model capabilities
    _vision_models_cache = None
    _cache_timestamp = 0

    @staticmethod
    def build_enhanced_system_prompt(base_prompt: str, ai_preferences: dict) -> str:
        """
        Prepend user preferences to system prompt if enabled.

        Args:
            base_prompt: The base system prompt from config
            ai_preferences: User's AI preferences dict

        Returns:
            Enhanced system prompt with user preferences prepended
        """
        if not ai_preferences or not ai_preferences.get('enabled', False):
            return base_prompt or ''

        parts = []
        user_info = ai_preferences.get('user_info', {})
        behavior = ai_preferences.get('behavior', {})

        if user_info.get('name'):
            parts.append(f"User's name: {user_info['name']}")
        if user_info.get('language'):
            parts.append(f"Respond in: {user_info['language']}")
        if user_info.get('expertise_level'):
            parts.append(f"User expertise: {user_info['expertise_level']}")
        if behavior.get('tone'):
            parts.append(f"Tone: {behavior['tone']}")
        if behavior.get('response_style'):
            parts.append(f"Response style: {behavior['response_style']}")
        if ai_preferences.get('custom_instructions'):
            parts.append(f"Instructions: {ai_preferences['custom_instructions']}")

        if not parts:
            return base_prompt or ''

        preamble = "[User Preferences]\n" + "\n".join(parts) + "\n\n"
        return preamble + (base_prompt or '')

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
        """Check if a model supports image input.

        Consults the live model registry first; falls back to the cached OR
        API query, and finally to the static ``_FALLBACK_VISION_MODELS`` list.
        """
        # Try the live registry first (fast, no HTTP call when DB is warm).
        try:
            from app.services.model_registry_service import ModelRegistryService
            result = ModelRegistryService().is_vision_capable(model_id)
            # Registry returns None when the model is absent; treat that as
            # unknown and fall through rather than false-negating.
            if result is not None:
                return bool(result)
        except Exception as e:
            logger.warning('registry vision check failed for %s: %s', model_id, e)

        cache_ttl = 3600  # 1 hour cache

        # Check the OR-API-backed in-memory cache.
        if (OpenRouterService._vision_models_cache is not None and
                time.time() - OpenRouterService._cache_timestamp < cache_ttl):
            return model_id in OpenRouterService._vision_models_cache

        # Refresh cache via OR API.
        try:
            vision_models = OpenRouterService.get_models_by_modality(input_modality='image')
            OpenRouterService._vision_models_cache = set(m.get('id') for m in vision_models)
            OpenRouterService._cache_timestamp = time.time()
            return model_id in OpenRouterService._vision_models_cache
        except Exception:
            pass

        # Final fallback to static list.
        return model_id in OpenRouterService._FALLBACK_VISION_MODELS

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
        stream: bool = False,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        feature: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
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
            user_id: Optional user ID for usage attribution.
            conversation_id: Optional conversation ID for usage attribution.
            feature: Optional feature tag (e.g. 'chat', 'arena', 'debate') for usage attribution.

        Returns:
            If stream=False: dict with response
            If stream=True: Generator yielding chunks
        """
        # Deprecation check — best-effort, never raises.
        try:
            from app.services.model_registry_service import ModelRegistryService
            doc = ModelRegistryService().get(model)
            if doc and doc.get('expiration_date'):
                logger.warning(
                    'model %s is deprecated (expires %s)', model, doc['expiration_date']
                )
        except Exception:
            pass

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
            'stream': stream,
            'usage': {'include': True},
        }

        if stream:
            payload['stream_options'] = {'include_usage': True}
            return OpenRouterService._stream_completion(
                payload, user_id=user_id, conversation_id=conversation_id, feature=feature,
                workspace_id=workspace_id, project_id=project_id, origin=origin,
            )
        else:
            return OpenRouterService._sync_completion(
                payload, user_id=user_id, conversation_id=conversation_id, feature=feature,
                workspace_id=workspace_id, project_id=project_id, origin=origin,
            )

    @staticmethod
    def _sync_completion(
        payload: Dict,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        feature: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
        timeout: int = 120,
    ) -> Dict:
        """Non-streaming completion.

        Args:
            timeout: HTTP timeout in seconds. Default 120 preserves prior
                behavior; latency-sensitive callers (e.g. Smart scan) may
                pass a tighter budget.
        """
        try:
            response = requests.post(
                f'{OpenRouterService.BASE_URL}/chat/completions',
                headers=OpenRouterService.get_headers(),
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()
            data = response.json()
            # Record usage — never let this block the caller.
            try:
                # Pull finish_reason from the first choice if present.
                finish_reason = None
                choices = data.get('choices') or []
                if choices:
                    finish_reason = choices[0].get('finish_reason')
                OpenRouterService._record_usage(
                    user_id, conversation_id,
                    data.get('model') or payload.get('model'),
                    data.get('usage'),
                    feature,
                    generation_id=data.get('id'),
                    workspace_id=workspace_id,
                    project_id=project_id,
                    is_streaming=False,
                    finish_reason=finish_reason,
                    origin=origin,
                )
            except Exception as e:
                logger.warning('usage recording failed: %s', e)
            return data
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
    def _stream_completion(
        payload: Dict,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        feature: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
    ) -> Generator:
        """Streaming completion - yields chunks"""
        final_usage = None
        model_used = payload.get('model')
        generation_id = None
        finish_reason = None
        usage_recorded = False

        def _record_now():
            nonlocal usage_recorded
            if usage_recorded:
                return
            usage_recorded = True
            try:
                OpenRouterService._record_usage(
                    user_id, conversation_id, model_used, final_usage, feature,
                    generation_id=generation_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    is_streaming=True,
                    finish_reason=finish_reason,
                    origin=origin,
                )
            except Exception as e:
                logger.warning('usage recording failed (stream): %s', e)

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
                            _record_now()
                            yield {'done': True}
                            break
                        try:
                            chunk = json.loads(data)
                            # Capture usage from the final usage chunk that OR
                            # emits when stream_options.include_usage=True.
                            if chunk.get('usage'):
                                final_usage = chunk['usage']
                            if chunk.get('model'):
                                model_used = chunk['model']
                            if chunk.get('id') and not generation_id:
                                generation_id = chunk['id']
                            # Capture finish_reason from a delta chunk.
                            ch_choices = chunk.get('choices') or []
                            if ch_choices:
                                fr = ch_choices[0].get('finish_reason')
                                if fr:
                                    finish_reason = fr
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
            return
        except Exception as e:
            yield {
                'error': {
                    'message': str(e),
                    'code': 500
                }
            }
            return

        # Safety net: stream ended without [DONE] (e.g. server disconnect).
        _record_now()

    @staticmethod
    def _record_usage(
        user_id,
        conversation_id,
        model_id: str,
        response_usage: Optional[Dict],
        feature: Optional[str],
        generation_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        is_streaming: bool = False,
        finish_reason: Optional[str] = None,
        origin: str = 'web',
    ) -> None:
        """Write one row to usage_logs. Silent no-op when user_id or usage is absent."""
        if not user_id or not response_usage:
            return

        prompt_tokens = int(response_usage.get('prompt_tokens', 0) or 0)
        completion_tokens = int(response_usage.get('completion_tokens', 0) or 0)
        prompt_details = response_usage.get('prompt_tokens_details') or {}
        completion_details = response_usage.get('completion_tokens_details') or {}
        cached_tokens = int(prompt_details.get('cached_tokens', 0) or 0)
        cache_write_tokens = int(prompt_details.get('cache_write_tokens', 0) or 0)
        reasoning_tokens = int(completion_details.get('reasoning_tokens', 0) or 0)
        upstream_cost = response_usage.get('upstream_cost_usd')
        if upstream_cost is None:
            upstream_cost = response_usage.get('upstream_cost')

        cost = response_usage.get('cost')
        if cost is None:
            if generation_id:
                try:
                    import requests as _requests
                    _gr = _requests.get(
                        f'{OpenRouterService.BASE_URL}/generation?id={generation_id}',
                        headers=OpenRouterService.get_headers(),
                        timeout=10,
                    )
                    _gr.raise_for_status()
                    cost = (_gr.json().get('data') or {}).get('total_cost')
                except Exception:
                    cost = None
            if cost is None:
                try:
                    from app.services.model_registry_service import ModelRegistryService
                    pricing = ModelRegistryService().get_pricing(model_id)
                    cost = (
                        pricing['prompt'] * prompt_tokens
                        + pricing['completion'] * completion_tokens
                        + pricing.get('cached', 0) * cached_tokens
                    )
                except Exception:
                    logger.warning('OR cost+gen lookup both missing for gen=%s model=%s', generation_id, model_id)
                    cost = 0.0

        provider = None
        if model_id and '/' in model_id:
            provider = model_id.split('/', 1)[0]

        try:
            from app.models.usage_log import UsageLogModel
            UsageLogModel.create(
                user_id=user_id,
                conversation_id=conversation_id,
                model_id=model_id,
                model=model_id,
                provider=provider,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                cached_tokens=cached_tokens,
                cache_write_tokens=cache_write_tokens,
                reasoning_tokens=reasoning_tokens,
                cost_usd=float(cost or 0),
                upstream_cost_usd=float(upstream_cost) if upstream_cost is not None else None,
                feature=feature,
                response_usage=response_usage,
                generation_id=generation_id,
                workspace_id=workspace_id,
                project_id=project_id,
                is_streaming=bool(is_streaming),
                finish_reason=finish_reason,
                origin=origin or 'web',
            )
        except Exception as e:
            logger.warning(
                'usage_log create failed user=%s model=%s: %s', user_id, model_id, e
            )

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
    def generate_title(first_message: str, model: str = 'google/gemini-2.5-flash-lite') -> str:
        """Generate a conversation title from the first message using LLM"""
        prompt = f"""Generate a very short title (3-5 words max) for this conversation.
IMPORTANT: Respond in the SAME LANGUAGE as the message.
Return ONLY the title, no quotes or punctuation.

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
        """Check if a model supports image generation.

        Consults the live registry first; falls back to ``_FALLBACK_IMAGE_GENERATION_MODELS``.
        """
        try:
            from app.services.model_registry_service import ModelRegistryService
            result = ModelRegistryService().is_image_capable(model_id)
            if result is not None:
                return bool(result)
        except Exception as e:
            logger.warning('registry image-gen check failed for %s: %s', model_id, e)
        return model_id in OpenRouterService._FALLBACK_IMAGE_GENERATION_MODELS

    @staticmethod
    def is_vision_model(model_id: str) -> bool:
        """Check if a model supports image input (vision)"""
        # Fast path: static fallback list (no I/O).
        if model_id in OpenRouterService._FALLBACK_VISION_MODELS:
            return True
        # Dynamic check via registry / OR API cache.
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

    # Static fallback data for get_image_capable_models when registry is empty.
    _FALLBACK_IMAGE_CAPABLE_MODELS = [
        {
            'id': 'google/gemini-2.5-flash-image',
            'name': 'Gemini 2.5 Flash Image (Nano Banana)',
            'description': 'Fast, cheap text-to-image and editing. Up to 3 reference images.',
            'max_input_images': 3,
            'pricing': {'prompt': '0.0000003', 'completion': '0.0000025', 'image': '0.0000003'},
        },
        {
            'id': 'google/gemini-3.1-flash-image-preview',
            'name': 'Gemini 3.1 Flash Image Preview (Nano Banana 2)',
            'description': 'Pro-level quality at Flash speed. Optional 0.5K low-res mode. Up to 3 reference images.',
            'max_input_images': 3,
            'pricing': {'prompt': '0.0000005', 'completion': '0.000003'},
        },
        {
            'id': 'google/gemini-3-pro-image-preview',
            'name': 'Gemini 3 Pro Image (Nano Banana Pro)',
            'description': 'Top-tier multimodal reasoning, 1K/2K/4K output, up to 14 reference images.',
            'max_input_images': 14,
            'pricing': {'prompt': '0.000002', 'completion': '0.000012', 'image': '0.000002'},
        },
        {
            'id': 'openai/gpt-5-image-mini',
            'name': 'GPT-5 Image Mini',
            'description': 'Efficient OpenAI image gen with strong text rendering. Up to 16 reference images.',
            'max_input_images': 16,
            'pricing': {'prompt': '0.0000025', 'completion': '0.000002'},
        },
        {
            'id': 'openai/gpt-5-image',
            'name': 'GPT-5 Image',
            'description': 'Full GPT-5 reasoning + image gen. Strong instruction following. Up to 16 reference images.',
            'max_input_images': 16,
            'pricing': {'prompt': '0.00001', 'completion': '0.00001'},
        },
        {
            'id': 'openai/gpt-5.4-image-2',
            'name': 'GPT-5.4 Image 2',
            'description': 'Latest OpenAI flagship multimodal model with high-fidelity image edits. Up to 16 reference images.',
            'max_input_images': 16,
            'pricing': {'prompt': '0.000008', 'completion': '0.000015'},
        },
    ]

    @staticmethod
    def get_image_capable_models() -> List[Dict]:
        """Available image generation models on OpenRouter.

        Consults the live model registry first. Falls back to the hardcoded
        ``_FALLBACK_IMAGE_CAPABLE_MODELS`` list when the registry is empty or
        unavailable.

        ``max_input_images`` reflects the practical/documented input cap,
        not a model-side hard limit. Pricing fields use OpenRouter
        per-token pricing (USD/token) — frontend formats as needed.
        """
        try:
            from app.services.model_registry_service import ModelRegistryService
            registry_models = ModelRegistryService().find_by_modality(output=['image'])
            if registry_models:
                return registry_models
        except Exception as e:
            logger.warning('registry get_image_capable_models failed: %s', e)
        return OpenRouterService._FALLBACK_IMAGE_CAPABLE_MODELS

    @staticmethod
    def generate_image(
        prompt: str,
        model: str,
        negative_prompt: Optional[str] = None,
        input_images: Optional[List[str]] = None,
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        feature: Optional[str] = 'image',
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
    ) -> Dict:
        """Generate an image using OpenRouter API

        Args:
            prompt: Text prompt for image generation
            model: Model ID to use
            negative_prompt: Optional negative prompt
            input_images: Optional list of base64 data URIs or URLs for image-to-image
            user_id: Optional user ID for usage attribution.
            conversation_id: Optional conversation ID for usage attribution.
            feature: Feature tag for usage attribution (default 'image').
            workspace_id: Optional workspace ID for usage scoping.
            project_id: Optional project ID for usage scoping.
            origin: Request origin tag (default 'web').

        Returns:
            Dict with success, image_data, and usage information
        """
        # Validate input images count
        if input_images:
            max_images = OpenRouterService._FALLBACK_IMAGE_GENERATION_LIMITS.get(model, 0)
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
            response_usage = data.get('usage')
            if choices:
                message = choices[0].get('message', {})
                images = message.get('images', [])
                if images:
                    try:
                        OpenRouterService._record_usage(
                            user_id, conversation_id,
                            data.get('model') or model,
                            response_usage or {'completion_tokens': 1},
                            feature,
                            workspace_id=workspace_id,
                            project_id=project_id,
                            origin=origin,
                        )
                    except Exception as e:
                        logger.warning('image usage recording failed: %s', e)
                    return {
                        'success': True,
                        'image_data': images[0].get('image_url', {}).get('url', ''),
                        'usage': response_usage or {}
                    }
                # Some models return image in content
                content = message.get('content', '')
                if content.startswith('data:image'):
                    try:
                        OpenRouterService._record_usage(
                            user_id, conversation_id,
                            data.get('model') or model,
                            response_usage or {'completion_tokens': 1},
                            feature,
                            workspace_id=workspace_id,
                            project_id=project_id,
                            origin=origin,
                        )
                    except Exception as e:
                        logger.warning('image usage recording failed: %s', e)
                    return {
                        'success': True,
                        'image_data': content,
                        'usage': response_usage or {}
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

    # ------------------------------------------------------------------
    # Text-to-Speech
    # ------------------------------------------------------------------

    _FALLBACK_TTS_MODELS = [
        'openai/gpt-4o-mini-tts-2025-12-15',
        'mistralai/voxtral-mini-tts-2603',
    ]

    # Public alias for any callers still referencing the old name.
    TTS_MODELS = _FALLBACK_TTS_MODELS

    TTS_OPENAI_VOICES = [
        'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer',
        'ash', 'ballad', 'coral', 'sage',
    ]

    @staticmethod
    def generate_speech(
        input: str,
        model: str,
        voice: str,
        speed: float = 1.0,
        response_format: str = 'mp3',
        user_id: Optional[str] = None,
        conversation_id: Optional[str] = None,
        feature: Optional[str] = 'tts',
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
    ) -> Dict:
        """Generate speech audio via OpenRouter TTS.

        Mirrors :meth:`generate_image` conventions (bearer auth, app metadata
        headers, error-as-dict return). Unlike JSON endpoints this one replies
        with raw audio bytes and a ``X-Generation-Id`` header.

        Args:
            input: Text to synthesize. Must be non-empty.
            model: OpenRouter TTS model id. Validated against
                :data:`TTS_MODELS`.
            voice: Voice preset (e.g. ``alloy``). Validated against
                :data:`TTS_OPENAI_VOICES` only for OpenAI models — other
                providers pass through unchecked.
            speed: Playback speed multiplier, 0.25–4.0. Clamped silently.
            response_format: Audio container. Defaults to ``mp3``; caller is
                responsible for adjusting the returned ``mime`` if overridden.

        Returns:
            On success::

                {
                    'success': True,
                    'audio_bytes': bytes,
                    'mime': 'audio/mpeg',
                    'generation_id': str | None,
                }

            On failure::

                {'success': False, 'error': str}
        """
        if not input or not input.strip():
            return {'success': False, 'error': 'TTS input text is empty'}

        if model not in OpenRouterService.TTS_MODELS:
            # Don't hard-fail on unknown models — OpenRouter may add more.
            # Just surface a helpful hint if it's clearly off-list.
            pass

        # Clamp speed to OpenAI's documented 0.25-4.0 window.
        try:
            speed_val = float(speed)
        except (TypeError, ValueError):
            speed_val = 1.0
        speed_val = max(0.25, min(4.0, speed_val))

        payload = {
            'input': input,
            'model': model,
            'voice': voice,
            'response_format': response_format,
            'speed': speed_val,
        }

        mime_map = {
            'mp3': 'audio/mpeg',
            'opus': 'audio/opus',
            'aac': 'audio/aac',
            'flac': 'audio/flac',
            'wav': 'audio/wav',
            'pcm': 'audio/pcm',
        }
        mime = mime_map.get(response_format.lower(), 'audio/mpeg')

        try:
            response = requests.post(
                f'{OpenRouterService.BASE_URL}/tts',
                headers=OpenRouterService.get_headers(),
                json=payload,
                timeout=60,
            )
            response.raise_for_status()

            audio_bytes = response.content
            if not audio_bytes:
                return {'success': False, 'error': 'TTS returned empty audio payload'}

            generation_id = response.headers.get('X-Generation-Id')
            try:
                response_usage = response.json().get('usage') if response.headers.get('Content-Type', '').startswith('application/json') else None
            except Exception:
                response_usage = None
            if not response_usage:
                try:
                    from app.services.model_registry_service import ModelRegistryService
                    pricing = ModelRegistryService().get_pricing(model)
                    synthetic_cost = pricing.get('completion', 0) * len(input)
                except Exception:
                    synthetic_cost = 0
                response_usage = {'prompt_tokens': len(input), 'completion_tokens': 0, 'cost': synthetic_cost}
            try:
                OpenRouterService._record_usage(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    model_id=model,
                    response_usage=response_usage,
                    feature=feature,
                    generation_id=generation_id,
                    workspace_id=workspace_id,
                    project_id=project_id,
                    origin=origin,
                )
            except Exception as _e:
                logger.warning('tts usage recording failed: %s', _e)
            return {
                'success': True,
                'audio_bytes': audio_bytes,
                'mime': mime,
                'generation_id': generation_id,
            }
        except requests.exceptions.HTTPError as e:
            error_message = str(e)
            try:
                if e.response is not None:
                    # TTS failures still return JSON error bodies
                    error_data = e.response.json()
                    error_message = error_data.get('error', {}).get('message', error_message)
            except (ValueError, AttributeError):
                pass
            return {'success': False, 'error': error_message}
        except requests.exceptions.Timeout:
            return {'success': False, 'error': 'TTS request timed out after 60s'}
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ------------------------------------------------------------------
    # Video generation (async polling)
    # ------------------------------------------------------------------

    @staticmethod
    def generate_video(
        model: str,
        prompt: str,
        frame_images: Optional[List[Dict]] = None,
        duration: Optional[int] = None,
        resolution: str = '1080p',
        aspect_ratio: str = '16:9',
        generate_audio: bool = True,
        seed: Optional[int] = None,
        poll_interval: int = 30,
        timeout: int = 600,
        user_id: Optional[str] = None,
        workspace_id: Optional[str] = None,
        project_id: Optional[str] = None,
        origin: str = 'web',
    ) -> Dict:
        """Generate a video via OpenRouter's async ``/videos`` endpoint.

        POSTs the request (expecting a 202 with ``polling_url``), polls every
        ``poll_interval`` seconds until the job settles, then downloads the
        resulting mp4 from ``unsigned_urls[0]`` into the app's
        ``UPLOAD_FOLDER`` under the scheme
        ``video_{user_id or 'anon'}_{generation_id}.mp4``.

        Args:
            model: OpenRouter video model id (e.g. ``google/veo-3.1``).
            prompt: Text description of the desired clip.
            frame_images: Optional list of ``{frame_type, url}`` dicts for
                img2vid. ``url`` may be a ``data:image`` URI or https URL.
            duration: Clip length in seconds. Provider-dependent.
            resolution: ``720p`` / ``1080p``.
            aspect_ratio: ``16:9`` / ``9:16`` / ``1:1``.
            generate_audio: Enable native audio generation (Veo 3+).
            seed: Optional deterministic seed.
            poll_interval: Seconds between poll GETs (default 30).
            timeout: Total wall-clock budget in seconds (default 600).
            user_id: Used to build the local filename; ``'anon'`` if None.

        Returns:
            On success::

                {
                    'success': True,
                    'video_url': '/api/uploads/video/video_<user>_<gen>.mp4',
                    'local_path': '<abs path under UPLOAD_FOLDER>',
                    'duration_sec': int | None,
                    'resolution': str,
                    'generation_id': str,
                }

            On failure (API error, poll timeout, terminal non-success status,
            or download error)::

                {'success': False, 'error': str}
        """
        if not prompt or not prompt.strip():
            return {'success': False, 'error': 'Video prompt is empty'}

        # Build request body, dropping None fields so we only send what the caller set.
        body: Dict = {
            'model': model,
            'prompt': prompt,
            'resolution': resolution,
            'aspect_ratio': aspect_ratio,
            'generate_audio': bool(generate_audio),
        }
        if frame_images:
            body['frame_images'] = frame_images
        if duration is not None:
            body['duration'] = int(duration)
        if seed is not None:
            body['seed'] = int(seed)

        started = time.time()

        # --- Submit job ---
        try:
            submit_resp = requests.post(
                f'{OpenRouterService.BASE_URL}/videos',
                headers=OpenRouterService.get_headers(),
                json=body,
                timeout=60,
            )
            submit_resp.raise_for_status()
        except requests.exceptions.HTTPError as e:
            error_message = str(e)
            try:
                if e.response is not None:
                    error_data = e.response.json()
                    error_message = error_data.get('error', {}).get('message', error_message)
            except (ValueError, AttributeError):
                pass
            return {'success': False, 'error': f'Video submit failed: {error_message}'}
        except requests.exceptions.Timeout:
            return {'success': False, 'error': 'Video submit timed out after 60s'}
        except Exception as e:
            return {'success': False, 'error': f'Video submit error: {e}'}

        try:
            submit_data = submit_resp.json()
        except ValueError:
            return {'success': False, 'error': 'Video submit returned non-JSON response'}

        polling_url = submit_data.get('polling_url')
        generation_id = submit_data.get('id')
        if not polling_url or not generation_id:
            return {
                'success': False,
                'error': f'Video submit missing polling_url/id: {submit_data}',
            }

        # --- Poll ---
        poll_headers = OpenRouterService.get_headers()
        final_data: Optional[Dict] = None
        last_status = submit_data.get('status', 'pending')

        while True:
            if time.time() - started > timeout:
                return {
                    'success': False,
                    'error': f'Video generation timed out after {timeout}s '
                             f'(last status: {last_status}, id: {generation_id})',
                }

            time.sleep(poll_interval)

            try:
                poll_resp = requests.get(polling_url, headers=poll_headers, timeout=30)
                poll_resp.raise_for_status()
                poll_data = poll_resp.json()
            except requests.exceptions.Timeout:
                # Transient; just continue polling until overall timeout.
                continue
            except requests.exceptions.HTTPError as e:
                error_message = str(e)
                try:
                    if e.response is not None:
                        error_data = e.response.json()
                        error_message = error_data.get('error', {}).get('message', error_message)
                except (ValueError, AttributeError):
                    pass
                return {'success': False, 'error': f'Video poll failed: {error_message}'}
            except Exception as e:
                return {'success': False, 'error': f'Video poll error: {e}'}

            last_status = poll_data.get('status', 'pending')
            if last_status in ('completed', 'failed', 'cancelled', 'expired'):
                final_data = poll_data
                break

        assert final_data is not None  # loop only exits with data or returns early

        if last_status != 'completed':
            err = final_data.get('error') or f'Video job terminated with status={last_status}'
            if isinstance(err, dict):
                err = err.get('message', str(err))
            return {'success': False, 'error': str(err)}

        unsigned_urls = final_data.get('unsigned_urls') or []
        if not unsigned_urls:
            return {'success': False, 'error': 'Completed video response has no unsigned_urls'}

        mp4_url = unsigned_urls[0]

        # --- Download mp4 into UPLOAD_FOLDER ---
        upload_folder = current_app.config.get('UPLOAD_FOLDER', 'uploads')
        if not os.path.exists(upload_folder):
            os.makedirs(upload_folder, exist_ok=True)

        safe_user = (user_id or 'anon').replace('/', '_').replace('\\', '_')
        safe_gen = str(generation_id).replace('/', '_').replace('\\', '_')
        filename = f'video_{safe_user}_{safe_gen}.mp4'
        local_path = os.path.join(upload_folder, filename)

        # OpenRouter's `unsigned_urls` for /videos/{id}/content require the same
        # Bearer auth as the rest of the API despite the name. Reuse poll headers.
        try:
            with requests.get(mp4_url, headers=poll_headers, stream=True, timeout=300) as dl:
                dl.raise_for_status()
                with open(local_path, 'wb') as fh:
                    for chunk in dl.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            fh.write(chunk)
        except requests.exceptions.Timeout:
            return {'success': False, 'error': 'Video download timed out after 300s'}
        except Exception as e:
            # Clean up partial file if any
            try:
                if os.path.exists(local_path):
                    os.remove(local_path)
            except OSError:
                pass
            return {'success': False, 'error': f'Video download failed: {e}'}

        video_url = f'/api/uploads/video/{filename}'

        duration_sec = final_data.get('duration') or final_data.get('duration_sec') or duration

        video_usage = final_data.get('usage')
        if not video_usage:
            logger.warning('video usage unavailable for gen=%s', generation_id)
            video_usage = {'prompt_tokens': 0, 'completion_tokens': 0, 'cost': 0}
        try:
            OpenRouterService._record_usage(
                user_id=user_id,
                conversation_id=None,
                model_id=model,
                response_usage=video_usage,
                feature='video',
                generation_id=generation_id,
                workspace_id=workspace_id,
                project_id=project_id,
                origin=origin,
            )
        except Exception as _e:
            logger.warning('video usage recording failed: %s', _e)

        return {
            'success': True,
            'video_url': video_url,
            'local_path': local_path,
            'duration_sec': int(duration_sec) if duration_sec is not None else None,
            'resolution': final_data.get('resolution') or resolution,
            'generation_id': generation_id,
        }
