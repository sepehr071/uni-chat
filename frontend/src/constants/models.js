/**
 * Default models available without creating custom assistants
 * These can be used in Chat, Arena, and Debate modes
 */
export const DEFAULT_MODELS = [
  {
    id: 'google/gemini-3-flash-preview',
    name: 'Gemini 3 Flash',
    avatar: '✨',
    description: 'Fast and capable multimodal model'
  },
  {
    id: 'x-ai/grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    avatar: '🚀',
    description: 'Quick responses with personality'
  },
  {
    id: 'google/gemini-2.5-flash-lite',
    name: 'Gemini 2.5 Lite',
    avatar: '⚡',
    description: 'Lightweight and efficient'
  },
  {
    id: 'openai/gpt-5.2',
    name: 'GPT-5.2',
    avatar: '🧠',
    description: 'Advanced reasoning capabilities'
  },
  {
    id: 'anthropic/claude-sonnet-4.5',
    name: 'Claude Sonnet 4.5',
    avatar: '🎭',
    description: 'Balanced intelligence and speed'
  },
]

/**
 * Models available for browser-use Automate Agent tasks
 */
export const BROWSER_USE_MODELS = [
  { id: 'claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
  { id: 'claude-opus-4.6',   label: 'Claude Opus 4.6'   },
  { id: 'gpt-5.4-mini',      label: 'GPT-5.4 Mini'      },
]

export const DEFAULT_BROWSER_USE_MODEL = 'claude-sonnet-4.6'

/**
 * Check if a config ID is a quick model
 */
export function isQuickModel(configId) {
  return configId?.startsWith('quick:')
}

/**
 * Extract model ID from quick config ID
 */
export function getModelIdFromQuick(configId) {
  if (isQuickModel(configId)) {
    return configId.replace('quick:', '')
  }
  return configId
}

/**
 * Find a default model by its ID
 */
export function findDefaultModel(modelId) {
  return DEFAULT_MODELS.find(m => m.id === modelId)
}

/**
 * Get display name for a quick model
 */
export function getQuickModelName(modelId) {
  const model = findDefaultModel(modelId)
  return model?.name || modelId
}
