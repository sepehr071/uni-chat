/**
 * Helper Service - Streams the in-app helper assistant via SSE.
 *
 * Mirrors `services/streamService.js` (chat/arena/debate). Helper events the
 * server emits:
 *   - message_start                  {message_id, ...}
 *   - message_chunk                  {message_id, content}
 *   - message_complete               {message_id, content, deep_links?}
 *   - message_error                  {error, code?}
 *   - dlp_block                      {matches, highest_action}    (HTTP 403)
 *   - dlp_confirm_required           {matches, highest_action}    (HTTP 409)
 *
 * The DLP variants surface the parsed body via `onEvent` BEFORE returning so
 * the caller can wire its violation modal without a separate code path.
 */

const API_BASE_URL = '/api'

function getToken() {
  return localStorage.getItem('accessToken')
}

function parseSSE(text) {
  const events = []
  const lines = text.split('\n')

  let currentEvent = null
  let currentData = ''

  for (const line of lines) {
    if (line.startsWith('event: ')) {
      currentEvent = line.slice(7).trim()
    } else if (line.startsWith('data: ')) {
      currentData = line.slice(6)
    } else if (line === '' && currentEvent && currentData) {
      try {
        events.push({
          type: currentEvent,
          data: JSON.parse(currentData),
        })
      } catch (e) {
        console.error('Failed to parse helper SSE data:', currentData, e)
      }
      currentEvent = null
      currentData = ''
    }
  }

  return events
}

/**
 * Stream a helper response.
 *
 * @param {Object} params
 * @param {string} params.message - User message.
 * @param {Object} [params.page_context] - Page-context payload {route, title?, ...}.
 * @param {boolean} [params.dlp_confirmed] - User accepted a `require_confirm` warning.
 * @param {(event: {type: string, ...payload: object}) => void} onEvent - Event sink.
 * @param {AbortSignal} [signal] - Optional external abort signal.
 * @returns {Promise<{abort: () => void}>}
 */
export async function streamHelper(
  { message, page_context, dlp_confirmed } = {},
  onEvent,
  signal,
) {
  const controller = new AbortController()
  if (signal) {
    signal.addEventListener('abort', () => controller.abort())
  }

  const body = { message }
  if (page_context !== undefined) body.page_context = page_context
  if (dlp_confirmed) body.dlp_confirmed = true

  const emit = (type, payload) => {
    if (typeof onEvent === 'function') {
      onEvent({ type, ...(payload || {}) })
    }
  }

  try {
    const response = await fetch(`${API_BASE_URL}/helper/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}))

      if (response.status === 403) {
        emit('dlp_block', errorBody)
        return { abort: () => controller.abort() }
      }
      if (response.status === 409) {
        emit('dlp_confirm_required', errorBody)
        return { abort: () => controller.abort() }
      }

      emit('message_error', {
        error: errorBody.error || `HTTP ${response.status}`,
        code: errorBody.code,
      })
      return { abort: () => controller.abort() }
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const drain = (chunk) => {
      const events = parseSSE(chunk)
      for (const ev of events) {
        // Pass the inner data spread so listeners see flat payloads like
        // {type:'message_chunk', message_id, content}
        emit(ev.type, ev.data || {})
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim()) continue
        drain(part + '\n\n')
      }
    }

    if (buffer.trim()) {
      drain(buffer + '\n\n')
    }
  } catch (error) {
    if (error.name === 'AbortError') return { abort: () => controller.abort() }
    emit('message_error', { error: error.message })
  }

  return { abort: () => controller.abort() }
}

/**
 * Cancel an in-flight helper generation.
 *
 * @param {string} messageId
 */
export async function cancelHelper(messageId) {
  const response = await fetch(`${API_BASE_URL}/helper/cancel/${messageId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
  return response.json()
}

/**
 * Wipe the user's helper history (server-side).
 */
export async function clearHelper() {
  const response = await fetch(`${API_BASE_URL}/helper/clear`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
  return response.json()
}

/**
 * Fetch persisted helper history.
 *
 * @returns {Promise<Array<{role:string,content:string,page_context?:object,deep_links?:Array,created_at:string}>>}
 */
export async function getHelperHistory() {
  const response = await fetch(`${API_BASE_URL}/helper/history`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getToken()}`,
    },
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}))
    throw new Error(errorBody.error || `HTTP ${response.status}`)
  }
  const data = await response.json()
  // Backend may return either an array or {messages:[...]}; accept both.
  if (Array.isArray(data)) return data
  return data?.messages || []
}

export default {
  streamHelper,
  cancelHelper,
  clearHelper,
  getHelperHistory,
}
