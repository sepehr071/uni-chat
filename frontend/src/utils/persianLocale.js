/**
 * Persian locale helpers — Western Arabic digit (0-9) → Persian (۰-۹) conversion
 * plus a small wrapper around `Date#toLocaleTimeString('fa-IR')` for time pills.
 *
 * Used by `utils/dateLocale.js` to localise digits when the active i18n
 * language is `fa`. Keep this module side-effect-free (no React, no i18n
 * import) so it can be tree-shaken into any context (tests, web workers).
 */

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

/**
 * Replace every ASCII digit (0-9) in `value` with its Persian counterpart.
 * Non-string inputs are coerced via `String()`. Returns the original input
 * unchanged when `value == null`.
 */
export function toPersianDigits(value) {
  if (value == null) return value
  const str = typeof value === 'string' ? value : String(value)
  return str.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)])
}

/**
 * Format a Date (or anything Date can parse) into a HH:MM string in Persian
 * locale. Returns `''` for null/invalid inputs.
 */
export function formatPersianTime(date, { hour = '2-digit', minute = '2-digit' } = {}) {
  if (date == null) return ''
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('fa-IR', { hour, minute })
}
