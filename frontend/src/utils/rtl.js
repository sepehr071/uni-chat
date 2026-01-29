/**
 * RTL (Right-to-Left) text detection utilities
 * Supports Persian, Arabic, and Hebrew scripts
 */

// Unicode ranges for RTL scripts:
// - Arabic: \u0600-\u06FF (basic), \u0750-\u077F (supplement),
//   \u08A0-\u08FF (extended-A), \uFB50-\uFDFF (presentation forms A),
//   \uFE70-\uFEFF (presentation forms B)
// - Hebrew: \u0590-\u05FF
const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/
const RTL_CHAR_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0590-\u05FF]/g

/**
 * Check if text contains any RTL characters
 * @param {string} text - Text to check
 * @returns {boolean} - True if text contains RTL characters
 */
export function containsRTL(text) {
  if (!text || typeof text !== 'string') return false
  return RTL_REGEX.test(text)
}

/**
 * Check if text is predominantly RTL (>30% RTL characters)
 * Uses a lower threshold to catch mixed content that starts with RTL
 * @param {string} text - Text to check
 * @returns {boolean} - True if text is predominantly RTL
 */
export function isRTL(text) {
  if (!text || typeof text !== 'string') return false

  // Remove code blocks and inline code before checking (they should remain LTR)
  const textWithoutCode = text
    .replace(/```[\s\S]*?```/g, '') // Remove fenced code blocks
    .replace(/`[^`]+`/g, '')        // Remove inline code
    .trim()

  if (!textWithoutCode) return false

  const rtlMatches = textWithoutCode.match(RTL_CHAR_REGEX)
  if (!rtlMatches) return false

  // Count only letter characters (exclude spaces, numbers, punctuation)
  const letterCount = textWithoutCode.replace(/[\s\d\p{P}]/gu, '').length
  if (letterCount === 0) return false

  const rtlRatio = rtlMatches.length / letterCount
  return rtlRatio > 0.3 // 30% threshold
}

/**
 * Get the text direction for a given text
 * @param {string} text - Text to analyze
 * @returns {'rtl' | 'ltr'} - Text direction
 */
export function getTextDirection(text) {
  return isRTL(text) ? 'rtl' : 'ltr'
}
