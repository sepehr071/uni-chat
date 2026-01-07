/**
 * Stream Service - Handles SSE (Server-Sent Events) streaming for chat and arena
 * Replaces WebSocket/Socket.IO implementation
 */

const API_BASE_URL = '/api'

/**
 * Get auth token from localStorage
 */
function getToken() {
  return localStorage.getItem('accessToken')
}

/**
 * Parse SSE event text into structured events
 * SSE format: "event: type\ndata: {...}\n\n"
 */
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
          data: JSON.parse(currentData)
        })
      } catch (e) {
        console.error('Failed to parse SSE data:', currentData, e)
      }
      currentEvent = null
      currentData = ''
    }
  }

  return events
}

/**
 * Stream chat messages using SSE
 *
 * @param {Object} data - Request data
 * @param {string|null} data.conversation_id - Existing conversation ID or null for new
 * @param {string} data.config_id - LLM config ID
 * @param {string} data.message - User message content
 * @param {Array} data.attachments - Image attachments (optional)
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onConversationCreated - New conversation created
 * @param {Function} handlers.onMessageSaved - User message saved
 * @param {Function} handlers.onMessageStart - AI generation started
 * @param {Function} handlers.onMessageChunk - Streaming chunk received
 * @param {Function} handlers.onMessageComplete - Generation complete
 * @param {Function} handlers.onMessageError - Error occurred
 * @param {Function} handlers.onTitleUpdated - Title was updated
 * @returns {Promise<{abort: Function}>} Object with abort function to cancel stream
 */
export async function streamChat(data, handlers) {
  const controller = new AbortController()

  try {
    const response = await fetch(`${API_BASE_URL}/chat/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify(data),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete events from buffer
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || '' // Keep incomplete event in buffer

      for (const part of parts) {
        if (!part.trim()) continue

        const events = parseSSE(part + '\n\n')
        for (const event of events) {
          const handler = {
            'conversation_created': handlers.onConversationCreated,
            'message_saved': handlers.onMessageSaved,
            'message_start': handlers.onMessageStart,
            'message_chunk': handlers.onMessageChunk,
            'message_complete': handlers.onMessageComplete,
            'message_error': handlers.onMessageError,
            'title_updated': handlers.onTitleUpdated,
            'error': handlers.onMessageError
          }[event.type]

          if (handler) {
            handler(event.data)
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const events = parseSSE(buffer + '\n\n')
      for (const event of events) {
        const handler = {
          'conversation_created': handlers.onConversationCreated,
          'message_saved': handlers.onMessageSaved,
          'message_start': handlers.onMessageStart,
          'message_chunk': handlers.onMessageChunk,
          'message_complete': handlers.onMessageComplete,
          'message_error': handlers.onMessageError,
          'title_updated': handlers.onTitleUpdated,
          'error': handlers.onMessageError
        }[event.type]

        if (handler) {
          handler(event.data)
        }
      }
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      // Stream was cancelled
      return
    }
    if (handlers.onMessageError) {
      handlers.onMessageError({ error: error.message })
    }
  }

  return { abort: () => controller.abort() }
}

/**
 * Cancel an ongoing chat generation
 *
 * @param {string} messageId - Message ID to cancel
 */
export async function cancelChat(messageId) {
  const response = await fetch(`${API_BASE_URL}/chat/cancel/${messageId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  })
  return response.json()
}

/**
 * Stream arena messages using SSE
 * Streams responses from multiple configs in parallel
 *
 * @param {Object} data - Request data
 * @param {string|null} data.session_id - Existing session ID or null for new
 * @param {string} data.message - User message content
 * @param {Array<string>} data.config_ids - Array of config IDs (2-4)
 * @param {Object} handlers - Event handlers
 * @param {Function} handlers.onSessionCreated - New session created
 * @param {Function} handlers.onUserMessage - User message saved
 * @param {Function} handlers.onMessageStart - Config started generating (includes config_id)
 * @param {Function} handlers.onMessageChunk - Streaming chunk (includes config_id)
 * @param {Function} handlers.onMessageComplete - Config finished (includes config_id)
 * @param {Function} handlers.onMessageError - Config error (includes config_id)
 * @returns {Promise<{abort: Function}>} Object with abort function
 */
export async function streamArena(data, handlers) {
  const controller = new AbortController()

  try {
    const response = await fetch(`${API_BASE_URL}/arena/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
      },
      body: JSON.stringify(data),
      signal: controller.signal
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()

      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Process complete events from buffer
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        if (!part.trim()) continue

        const events = parseSSE(part + '\n\n')
        for (const event of events) {
          const handler = {
            'arena_session_created': handlers.onSessionCreated,
            'arena_user_message': handlers.onUserMessage,
            'arena_message_start': handlers.onMessageStart,
            'arena_message_chunk': handlers.onMessageChunk,
            'arena_message_complete': handlers.onMessageComplete,
            'arena_message_error': handlers.onMessageError,
            'error': handlers.onMessageError
          }[event.type]

          if (handler) {
            handler(event.data)
          }
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      const events = parseSSE(buffer + '\n\n')
      for (const event of events) {
        const handler = {
          'arena_session_created': handlers.onSessionCreated,
          'arena_user_message': handlers.onUserMessage,
          'arena_message_start': handlers.onMessageStart,
          'arena_message_chunk': handlers.onMessageChunk,
          'arena_message_complete': handlers.onMessageComplete,
          'arena_message_error': handlers.onMessageError,
          'error': handlers.onMessageError
        }[event.type]

        if (handler) {
          handler(event.data)
        }
      }
    }

  } catch (error) {
    if (error.name === 'AbortError') {
      return
    }
    if (handlers.onMessageError) {
      handlers.onMessageError({ error: error.message })
    }
  }

  return { abort: () => controller.abort() }
}

/**
 * Cancel an ongoing arena generation
 *
 * @param {string} sessionId - Session ID to cancel
 */
export async function cancelArena(sessionId) {
  const response = await fetch(`${API_BASE_URL}/arena/cancel/${sessionId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`
    }
  })
  return response.json()
}

export default {
  streamChat,
  cancelChat,
  streamArena,
  cancelArena
}
