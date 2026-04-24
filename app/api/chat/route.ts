import { createClient } from '@/lib/supabase/server'
import {
  streamChatResponse,
  type ChatMessage,
  type UserChatContext,
} from '@/lib/claude/chat'
import type { ActivityLevel, Goal } from '@/lib/nutrition/calculator'

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

  const now = new Date()
  const todayStart = utcStartOfDay(now)
  const todayEnd = addUtcDays(todayStart, 1)
  const weekStart = addUtcDays(todayStart, -7)

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
  const context = buildContext(profile, meals, todayStart)

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

function utcStartOfDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  )
}

function addUtcDays(d: Date, days: number): Date {
  const next = new Date(d)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function toUtcDateKey(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function shortWeekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

function buildContext(
  // Supabase row shape — using `any` here is OK because we immediately narrow
  // to the fields we care about via the UserChatContext construction below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any,
  meals: MealRow[],
  todayStart: Date
): UserChatContext {
  const todayKey = toUtcDateKey(todayStart)

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
    const key = toUtcDateKey(logged)
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
        loggedAt: logged.toISOString().slice(11, 16) + ' UTC',
      })
    }
  }

  // Build last 7 days (oldest first), including "no log" days.
  const lastSevenDays: UserChatContext['lastSevenDays'] = []
  for (let i = 7; i >= 1; i--) {
    const d = addUtcDays(todayStart, -i)
    const key = toUtcDateKey(d)
    const bucket = dayBuckets.get(key)
    lastSevenDays.push({
      dateKey: key,
      weekday: shortWeekday(d),
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
  const cursor = new Date(todayStart)
  if (!todayBucket || todayBucket.mealCount === 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  } else {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  while (true) {
    const key = toUtcDateKey(cursor)
    const bucket = dayBuckets.get(key)
    if (!bucket || bucket.mealCount === 0) break
    streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
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
