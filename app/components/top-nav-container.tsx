import { createClient } from '@/lib/supabase/server'
import { computeStreak, toUtcDateKey, utcStartOfDay } from '@/lib/streak'
import TopNav from './top-nav'

/**
 * Server-side wrapper around the client `TopNav`.
 *
 * Lives in the root layout so every authed page has the nav already sitting
 * at the top when it paints (no client-side fetch, no loading flash for the
 * streak badge). Anonymous / pre-onboarding users get the bare nav with no
 * streak — the client component hides itself entirely on /, /login, and
 * /onboarding anyway.
 *
 * The streak computation is intentionally lightweight: we ask Supabase for
 * just the `logged_at` column over a 32-day window (the longest active
 * celebratable milestone needs 30, plus a day of headroom either side), bucket
 * by UTC date key, and run the shared `computeStreak` helper. That's ~1 query
 * per page load with a small payload.
 */
export default async function TopNavContainer() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No user → plain nav. (It'll hide itself on unauth routes regardless.)
  if (!user) {
    return <TopNav streak={null} />
  }

  const now = new Date()
  const todayStart = utcStartOfDay(now)
  // 32 days gives us enough headroom for the 30-day milestone without bloating
  // every nav render into a big meals scan.
  const windowStart = new Date(todayStart)
  windowStart.setUTCDate(windowStart.getUTCDate() - 32)

  const { data } = await supabase
    .from('meals')
    .select('logged_at')
    .eq('user_id', user.id)
    .gte('logged_at', windowStart.toISOString())
    .returns<Array<{ logged_at: string }>>()

  const keys = new Set<string>()
  for (const row of data ?? []) {
    keys.add(toUtcDateKey(new Date(row.logged_at)))
  }
  const streak = computeStreak(keys, now)

  return <TopNav streak={streak} />
}
