/**
 * Timezone-aware day helpers.
 *
 * The whole app used to compute "today" in UTC, which is fine if the user is
 * also in UTC — but a user in IST (UTC+5:30) would see "today" rolling over
 * at 5:30am local, and the dashboard would display *yesterday's* date during
 * the 5.5h window after their actual midnight. Same hazard for the streak,
 * history bucketing, and chat context.
 *
 * Strategy: a small client component writes the browser's IANA timezone to a
 * cookie (`nl_tz`) on first paint. Server reads the cookie and passes the
 * tz string into these helpers. Falls back to 'UTC' if the cookie isn't set
 * yet (first request after install / first request before client paint) so
 * we never crash — the page just briefly looks UTC-correct and re-renders
 * with the right answer once the cookie is written.
 *
 * All "start of day" / "date key" math is anchored to local midnight in the
 * user's tz, but the underlying Date instants are still UTC moments — which
 * is what Supabase wants for `.gte` / `.lt` comparisons against `logged_at`.
 */
import { cookies } from 'next/headers'

const TZ_COOKIE = 'nl_tz'

/**
 * Read the user's IANA timezone from the cookie. Falls back to 'UTC' if the
 * cookie is missing or contains a value Intl rejects.
 */
export async function getUserTimezone(): Promise<string> {
  const store = await cookies()
  const raw = store.get(TZ_COOKIE)?.value
  if (!raw) return 'UTC'
  try {
    // Validate by constructing a formatter — throws on bogus tz strings.
    new Intl.DateTimeFormat('en-CA', { timeZone: raw })
    return raw
  } catch {
    return 'UTC'
  }
}

/**
 * Minutes that `tz` is ahead of UTC at the given instant. Positive east of
 * UTC (IST = +330). Used to derive local-midnight-as-a-UTC-instant.
 */
function getTzOffsetMinutes(at: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = fmt.formatToParts(at)
  const m: Record<string, string> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = p.value
  // Some locales emit hour '24' for midnight; normalize to 0.
  let hour = Number(m.hour)
  if (hour === 24) hour = 0
  const localAsUtcMs = Date.UTC(
    Number(m.year),
    Number(m.month) - 1,
    Number(m.day),
    hour,
    Number(m.minute),
    Number(m.second)
  )
  return (localAsUtcMs - at.getTime()) / 60000
}

/**
 * Format a Date as YYYY-MM-DD in the given tz. The same key is used for
 * day bucketing across the dashboard, history, and streak.
 */
export function toDateKeyInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(date)
  let y = '',
    m = '',
    d = ''
  for (const p of parts) {
    if (p.type === 'year') y = p.value
    else if (p.type === 'month') m = p.value
    else if (p.type === 'day') d = p.value
  }
  return `${y}-${m}-${d}`
}

/**
 * Returns a Date whose UTC value is exactly the moment of local-midnight in
 * `tz` for the local-day that contains `now`.
 *
 * We refine once after the initial offset guess so DST transition days still
 * land on the right instant (the offset at midnight may differ from the
 * offset at "now" by an hour).
 */
export function startOfDayInTz(now: Date, tz: string): Date {
  // 1. Find the local Y/M/D for `now` in tz.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  let y = 0,
    m = 0,
    d = 0
  for (const p of parts) {
    if (p.type === 'year') y = Number(p.value)
    else if (p.type === 'month') m = Number(p.value)
    else if (p.type === 'day') d = Number(p.value)
  }
  // 2. First guess: Date.UTC(y,m-1,d) shifted by the offset *at now*.
  const offsetAtNow = getTzOffsetMinutes(now, tz)
  let candidate = new Date(Date.UTC(y, m - 1, d) - offsetAtNow * 60000)
  // 3. Refine if the offset at midnight differs (DST boundary day).
  const offsetAtCandidate = getTzOffsetMinutes(candidate, tz)
  if (offsetAtCandidate !== offsetAtNow) {
    candidate = new Date(Date.UTC(y, m - 1, d) - offsetAtCandidate * 60000)
  }
  return candidate
}

/**
 * Add `days` calendar days in the user's tz. Snaps back to local midnight
 * after a flat 24h shift so DST adds/drops don't bleed forward an hour.
 */
export function addDaysInTz(date: Date, days: number, tz: string): Date {
  const shifted = new Date(date.getTime() + days * 86400000)
  return startOfDayInTz(shifted, tz)
}

/**
 * Inverse of toDateKeyInTz: parse a YYYY-MM-DD string into the
 * local-midnight instant for that day in `tz`. Returns null for malformed
 * input or invalid calendar dates (e.g. 2026-02-31).
 */
export function parseDateKeyInTz(s: string, tz: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  // Use a noon-UTC anchor so the offset lookup never accidentally lands a
  // day before/after the requested date, then snap back to start-of-day.
  const anchor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
  const sod = startOfDayInTz(anchor, tz)
  // Round-trip check: rejects e.g. 2026-02-31 (which Date.UTC silently rolls).
  if (toDateKeyInTz(sod, tz) !== s) return null
  return sod
}

/**
 * "Saturday, April 25" — long-form date label localized to `tz`.
 */
export function formatLongDateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: tz,
  })
}

/**
 * "Sat, Apr 25" — month-aware short date for the history day cards.
 */
export function formatShortDateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  })
}

/**
 * "Sat" — 3-letter weekday for trend-chart x-axis labels.
 */
export function formatShortWeekdayInTz(date: Date, tz: string): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    timeZone: tz,
  })
}

/**
 * "23" — day-of-month number used by the trend chart secondary label.
 */
export function dayOfMonthInTz(date: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    day: '2-digit',
  })
  const parts = fmt.formatToParts(date)
  for (const p of parts) {
    if (p.type === 'day') return Number(p.value)
  }
  return date.getUTCDate()
}

/**
 * "14:23" — 24h HH:MM time string in `tz`. Used in chat context strings.
 */
export function formatHourMinuteInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return fmt.format(date)
}
