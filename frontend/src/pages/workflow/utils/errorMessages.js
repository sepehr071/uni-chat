/**
 * Maps raw backend workflow error strings to human-readable messages.
 * @param {string} rawError
 * @returns {string}
 */
export function mapWorkflowError(rawError) {
  if (!rawError) return 'An unknown error occurred.';

  const lower = rawError.toLowerCase();

  if (lower.includes('rate_limit') || lower.includes('rate limit')) {
    return 'Too many requests — wait a minute and try again.';
  }
  if (lower.includes('invalid_prompt') || lower.includes('safety') || lower.includes('blocked')) {
    return 'Prompt was rejected — try simpler wording.';
  }
  if (lower.includes('image_too_large') || lower.includes('image too large')) {
    return 'Reference image too big — try a smaller image.';
  }
  if (lower.includes('model_not_found') || lower.includes('404')) {
    return 'Selected model is unavailable — pick another.';
  }

  return rawError.trim().slice(0, 200);
}
