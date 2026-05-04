import { format, formatDistanceToNow, formatDistance, formatRelative } from 'date-fns'
import { faIR } from 'date-fns/locale'
import i18n from '../i18n'

function currentLocale() {
  return i18n.language === 'fa' ? faIR : undefined
}

export function fmtDate(date, formatStr) {
  return format(date, formatStr, { locale: currentLocale() })
}

export function fmtDistanceToNow(date, options = {}) {
  return formatDistanceToNow(date, { ...options, locale: currentLocale() })
}

export function fmtDistance(a, b, options = {}) {
  return formatDistance(a, b, { ...options, locale: currentLocale() })
}

export function fmtRelative(date, baseDate) {
  return formatRelative(date, baseDate, { locale: currentLocale() })
}
