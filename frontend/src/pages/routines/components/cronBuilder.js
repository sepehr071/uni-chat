// Client-side cron builder for the Simple schedule tab.
// Supports: hourly, daily, weekly, monthly. One-shot is handled outside cron.

export const FREQUENCIES = [
  { id: 'hourly', label: 'Hourly' },
  { id: 'daily', label: 'Daily' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'monthly', label: 'Monthly' },
]

export const WEEKDAYS = [
  { id: 1, short: 'Mon' },
  { id: 2, short: 'Tue' },
  { id: 3, short: 'Wed' },
  { id: 4, short: 'Thu' },
  { id: 5, short: 'Fri' },
  { id: 6, short: 'Sat' },
  { id: 0, short: 'Sun' },
]

export const PRESETS = [
  { label: 'Every hour', cron: '0 * * * *' },
  { label: 'Daily 9 AM', cron: '0 9 * * *' },
  { label: 'Weekdays 9 AM', cron: '0 9 * * 1-5' },
  { label: 'Weekly Mon 9 AM', cron: '0 9 * * 1' },
  { label: 'Monthly 1st 9 AM', cron: '0 9 1 * *' },
]

// time format "HH:MM" → [hour, minute]
function parseTime(time) {
  const [h, m] = (time || '09:00').split(':').map((n) => parseInt(n, 10) || 0)
  return [Math.min(23, Math.max(0, h)), Math.min(59, Math.max(0, m))]
}

function compactDays(days) {
  // Always emit a sorted, deduped CSV. Cron field uses 0-6 (Sun=0).
  const uniq = Array.from(new Set(days)).filter((d) => d >= 0 && d <= 6).sort((a, b) => a - b)
  if (uniq.length === 0) return '*'
  // Detect Mon-Fri shorthand
  if (uniq.length === 5 && uniq.join(',') === '1,2,3,4,5') return '1-5'
  // Detect Sat,Sun
  if (uniq.length === 2 && uniq.join(',') === '0,6') return '0,6'
  return uniq.join(',')
}

export function buildCron({ frequency, time, daysOfWeek, dayOfMonth, minute }) {
  const [h, m] = parseTime(time)
  switch (frequency) {
    case 'hourly': {
      const min = Number.isInteger(minute) ? Math.min(59, Math.max(0, minute)) : 0
      return `${min} * * * *`
    }
    case 'daily':
      return `${m} ${h} * * *`
    case 'weekly': {
      const days = compactDays(Array.isArray(daysOfWeek) && daysOfWeek.length ? daysOfWeek : [1])
      return `${m} ${h} * * ${days}`
    }
    case 'monthly': {
      const dom = Math.min(31, Math.max(1, parseInt(dayOfMonth, 10) || 1))
      return `${m} ${h} ${dom} * *`
    }
    default:
      return `${m} ${h} * * *`
  }
}

// Best-effort reverse: given cron, infer frequency + fields. Fallback undefined.
export function parseCron(cron) {
  if (typeof cron !== 'string') return null
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null
  const [minRaw, hourRaw, domRaw, monRaw, dowRaw] = parts
  if (monRaw !== '*') return null

  const minute = parseInt(minRaw, 10)
  const hour = parseInt(hourRaw, 10)
  const time =
    Number.isInteger(hour) && Number.isInteger(minute)
      ? `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
      : '09:00'

  // hourly: "{m} * * * *"
  if (hourRaw === '*' && domRaw === '*' && dowRaw === '*' && Number.isInteger(minute)) {
    return { frequency: 'hourly', minute, time: '00:00', daysOfWeek: [], dayOfMonth: 1 }
  }
  // daily: "{m} {h} * * *"
  if (domRaw === '*' && dowRaw === '*' && Number.isInteger(hour) && Number.isInteger(minute)) {
    return { frequency: 'daily', minute, time, daysOfWeek: [], dayOfMonth: 1 }
  }
  // weekly: "{m} {h} * * {days}"
  if (domRaw === '*' && dowRaw !== '*' && Number.isInteger(hour) && Number.isInteger(minute)) {
    let days = []
    if (dowRaw === '1-5') days = [1, 2, 3, 4, 5]
    else if (dowRaw === '0,6' || dowRaw === '6,0') days = [0, 6]
    else if (/^[0-6](,[0-6])*$/.test(dowRaw)) days = dowRaw.split(',').map((n) => parseInt(n, 10))
    else return null
    return { frequency: 'weekly', minute, time, daysOfWeek: days, dayOfMonth: 1 }
  }
  // monthly: "{m} {h} {dom} * *"
  if (dowRaw === '*' && /^\d+$/.test(domRaw) && Number.isInteger(hour) && Number.isInteger(minute)) {
    return {
      frequency: 'monthly',
      minute,
      time,
      daysOfWeek: [],
      dayOfMonth: parseInt(domRaw, 10),
    }
  }
  return null
}
