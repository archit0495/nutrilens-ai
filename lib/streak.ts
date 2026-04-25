/**
 * Shared streak computation.
 *
 * The dashboard, history page, chatbot context, and top-nav badge all need the
 * same answer to "how many consecutive days has this user logged a meal?" —
 * and they must agree or the UX starts lying to itself.
 *
 * Rules (by intent):
 *   - Walk back day-by-day from today (in the user's *local* timezone),
 *     counting any local day with at least one logged meal.
 *   - If today is empty, don't penalize the user before breakfast — keep
 *     yesterday's streak alive until they've had a full blank day.
 *   - Streak ends the first time we hit a local day with zero meals (that
 *     isn't the still-open today).
 *
 * The function takes only what it needs — a set of local-tz date keys that
 * had at least one meal — so callers can fetch meals however makes sense for
 * their page. Date keys MUST be produced via `toDateKeyInTz(..., tz)` from
 * lib/timezone.ts using the same tz string passed here.
 */
import { addDaysInTz, startOfDayInTz, toDateKeyInTz } from './timezone'

export function computeStreak(
  loggedDayKeys: Set<string>,
  now: Date,
  tz: string
): number {
  const todayStart = startOfDayInTz(now, tz)
  const todayKey = toDateKeyInTz(todayStart, tz)
  const todayHasLog = loggedDayKeys.has(todayKey)

  // If today is still open (no meals yet), start counting from yesterday —
  // the streak shouldn't reset before the user's first meal of the day.
  let streak = todayHasLog ? 1 : 0
  let cursor = addDaysInTz(todayStart, -1, tz)

  while (true) {
    const key = toDateKeyInTz(cursor, tz)
    if (!loggedDayKeys.has(key)) break
    streak += 1
    cursor = addDaysInTz(cursor, -1, tz)
  }

  return streak
}

/**
 * Milestone tiers worth celebrating in the top-nav badge.
 * Ordered smallest → largest so consumers can find "the next one" easily.
 */
export const STREAK_MILESTONES: readonly number[] = [
  3, 7, 14, 30, 50, 100, 200, 365,
] as const

/**
 * Copy for each milestone, tuned to match the rest of the app's voice —
 * warm and specific, no moralizing, no fake superlatives.
 */
export const STREAK_MILESTONE_COPY: Record<number, string> = {
  3: 'Three days in a row. The habit is starting to take shape.',
  7: 'A full week of logging. Real pattern material now.',
  14: 'Two weeks straight. This is the good kind of boring.',
  30: 'A month of consistency. Most people never make it here.',
  50: 'Fifty days. That\u2019s a serious amount of data to learn from.',
  100: '100 days. Quietly remarkable.',
  200: '200 days. At this point, tracking is just part of your life.',
  365: 'A full year. Whatever works for you clearly works.',
}

/**
 * Highest milestone the current streak has earned, or null if below the
 * smallest tier. Used by the client-side celebration handler to decide
 * whether a new toast should pop.
 */
export function currentMilestone(streak: number): number | null {
  let hit: number | null = null
  for (const m of STREAK_MILESTONES) {
    if (streak >= m) hit = m
    else break
  }
  return hit
}
