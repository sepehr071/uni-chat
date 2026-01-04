import requests
import json
from flask import current_app
from typing import Generator, Optional, List, Dict


class OpenRouterService:
    """Service for interacting with OpenRouter API"""

    BASE_URL = 'https://openrouter.ai/api/v1'

    @staticmethod
    def get_api_key():
        return current_app.config.get('OPENROUTER_API_KEY', '')

    @staticmethod
    def get_headers():
        return {
            'Authorization': f'Bearer {OpenRouterService.get_api_key()}',
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:5000',  # Update for production
            'X-Title': 'Uni-Chat'
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
                    if line.startswith('data: '):
                        data = line[6:]  # Remove 'data: ' prefix
                        if data == '[DONE]':
                            yield {'done': True}
                            break
                        try:
                            chunk = json.loads(data)
                            yield chunk
                        except json.JSONDecodeError:
                            continue

        except requests.exceptions.HTTPError as e:
            error_data = {}
            try:
                error_data = e.response.json() if e.response else {}
            except:
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
                    if attachment['type'] == 'image':
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
