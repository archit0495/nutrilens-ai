import { createClient } from '@/lib/supabase/server'
import {
  streamChatResponse,
  type ChatMessage,
  type UserChatContext,
} from '@/lib/claude/chat'
import type { ActivityLevel, Goal } from '@/lib/nutrition/calculator'
import {
  addDaysInTz,
  formatHourMinuteInTz,
  formatShortWeekdayInTz,
  getUserTimezone,
  startOfDayInTz,
  toDateKeyInTz,
} from '@/lib/timezone'

/**
 * POST /api/chat
 *
 * Body: { messages: Array<{role: 'user' | 'assistant', content: string}> }
 *
 * Returns a Server-Sent-Events stream. See lib/claude/chat.ts for the wire
 * format (one `data: {json}\n\n` line per text delta, plus terminal done/error
 * events).
 *
 * Auth is enforced via the same Supabase helper the rest of the app uses —
 * anon visitors get a 401 and never see the user-scoped context prompt.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  let body: { messages?: unknown }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const messages = parseMessages(body.messages)
  if (!messages) {
    return new Response('Invalid messages payload', { status: 400 })
  }
  if (messages.length === 0) {
    return new Response('No messages to respond to', { status: 400 })
  }

  // ------------------------------------------------------------------
  // Load user context — profile, today's meals, last 7 days, streak.
  // ------------------------------------------------------------------
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.onboarded) {
    return new Response('Finish onboarding first', { status: 403 })
  }

  const tz = await getUserTimezone()
  const now = new Date()
  const todayStart = startOfDayInTz(now, tz)
  const todayEnd = addDaysInTz(todayStart, 1, tz)
  const weekStart = addDaysInTz(todayStart, -7, tz)

  // Single query spanning last 7 days + today, bucketed client-side.
  const { data: recent } = await supabase
    .from('meals')
    .select(
      'meal_name, calories, protein_g, carbs_g, fat_g, logged_at'
    )
    .eq('user_id', user.id)
    .gte('logged_at', weekStart.toISOString())
    .lt('logged_at', todayEnd.toISOString())
    .order('logged_at', { ascending: true })
    .returns<MealRow[]>()

  const meals = recent ?? []
  const context = buildContext(profile, meals, todayStart, tz)

  // ------------------------------------------------------------------
  // Stream the response.
  // ------------------------------------------------------------------
  const stream = streamChatResponse({ messages, context })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Hint to some proxies that they shouldn't buffer this.
      'X-Accel-Buffering': 'no',
    },
  })
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MealRow = {
  meal_name: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  logged_at: string
}

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw)) return null
  const out: ChatMessage[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null
    const m = item as Record<string, unknown>
    if (m.role !== 'user' && m.role !== 'assistant') return null
    if (typeof m.content !== 'string') return null
    out.push({ role: m.role, content: m.content.slice(0, 4000) })
  }
  // Cap history length to keep prompts (and latency) bounded.
  return out.slice(-12)
}

function buildContext(
  // Supabase row shape — using `any` here is OK because we immediately narrow
  // to the fields we care about via the UserChatContext construction below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any,
  meals: MealRow[],
  todayStart: Date,
  tz: string
): UserChatContext {
  const todayKey = toDateKeyInTz(todayStart, tz)

  // Group all meals by UTC date key.
  const dayBuckets = new Map<
    string,
    {
      calories: number
      protein_g: number
      carbs_g: number
      fat_g: number
      mealCount: number
    }
  >()

  const todayMeals: UserChatContext['today']['meals'] = []

  for (const m of meals) {
    const logged = new Date(m.logged_at)
    const key = toDateKeyInTz(logged, tz)
    const bucket = dayBuckets.get(key) ?? {
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      mealCount: 0,
    }
    bucket.calories += Number(m.calories ?? 0)
    bucket.protein_g += Number(m.protein_g ?? 0)
    bucket.carbs_g += Number(m.carbs_g ?? 0)
    bucket.fat_g += Number(m.fat_g ?? 0)
    bucket.mealCount += 1
    dayBuckets.set(key, bucket)

    if (key === todayKey) {
      todayMeals.push({
        name: m.meal_name || 'Unnamed meal',
        calories: Number(m.calories ?? 0),
        protein_g: Number(m.protein_g ?? 0),
        loggedAt: `${formatHourMinuteInTz(logged, tz)} ${tz}`,
      })
    }
  }

  // Build last 7 days (oldest first), including "no log" days.
  const lastSevenDays: UserChatContext['lastSevenDays'] = []
  for (let i = 7; i >= 1; i--) {
    const d = addDaysInTz(todayStart, -i, tz)
    const key = toDateKeyInTz(d, tz)
    const bucket = dayBuckets.get(key)
    lastSevenDays.push({
      dateKey: key,
      weekday: formatShortWeekdayInTz(d, tz),
      calories: bucket?.calories ?? 0,
      protein_g: bucket?.protein_g ?? 0,
      mealCount: bucket?.mealCount ?? 0,
    })
  }

  // Streak — walk back from today; keep yesterday's streak alive if today has
  // no log yet (mirrors the history page's logic).
  let streak = 0
  const todayBucket = dayBuckets.get(todayKey)
  if (todayBucket && todayBucket.mealCount > 0) streak = 1
  let cursor = addDaysInTz(todayStart, -1, tz)
  while (true) {
    const key = toDateKeyInTz(cursor, tz)
    const bucket = dayBuckets.get(key)
    if (!bucket || bucket.mealCount === 0) break
    streak += 1
    cursor = addDaysInTz(cursor, -1, tz)
  }

  const todayBucketFinal = todayBucket ?? {
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    mealCount: 0,
  }

  return {
    profile: {
      fullName: profile.full_name ?? null,
      age: profile.age,
      sex: profile.sex as 'male' | 'female',
      height_cm: profile.height_cm,
      weight_kg: profile.weight_kg,
      activity_level: profile.activity_level as ActivityLevel,
      goal: profile.goal as Goal,
      target_calories: profile.target_calories ?? 0,
      target_protein_g: profile.target_protein_g ?? 0,
      target_carbs_g: profile.target_carbs_g ?? 0,
      target_fat_g: profile.target_fat_g ?? 0,
    },
    today: {
      dateKey: todayKey,
      calories: todayBucketFinal.calories,
      protein_g: todayBucketFinal.protein_g,
      carbs_g: todayBucketFinal.carbs_g,
      fat_g: todayBucketFinal.fat_g,
      mealCount: todayBucketFinal.mealCount,
      meals: todayMeals,
    },
    lastSevenDays,
    streak,
  }
}
