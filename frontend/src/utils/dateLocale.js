import { format, formatDistanceToNow, formatDistance, formatRelative } from 'date-fns'
import { faIR } from 'date-fns/locale'
import i18n from '../i18n'
import { toPersianDigits } from './persianLocale'

function currentLocale() {
  return i18n.language === 'fa' ? faIR : undefined
}

function localizeDigits(out) {
  return i18n.language === 'fa' ? toPersianDigits(out) : out
}

export function fmtDate(date, formatStr) {
  return localizeDigits(format(date, formatStr, { locale: currentLocale() }))
}

export function fmtDistanceToNow(date, options = {}) {
  return localizeDigits(formatDistanceToNow(date, { ...options, locale: currentLocale() }))
}

export function fmtDistance(a, b, options = {}) {
  return localizeDigits(formatDistance(a, b, { ...options, locale: currentLocale() }))
}

export function fmtRelative(date, baseDate) {
  return localizeDigits(formatRelative(date, baseDate, { locale: currentLocale() }))
}
