import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'
import CoachCard, { CoachCardSkeleton } from './coach-card'
import type { Goal } from '@/lib/nutrition/calculator'
import type { CoachDaySummary } from '@/lib/claude/coach'

/**
 * History page.
 *
 * Shows a rolling N-day window of daily calorie totals with a small trend chart
 * up top and a list of day cards below. Day cards link back to the dashboard
 * with a `?date=YYYY-MM-DD` query param so the user can inspect any past day.
 * (Task #11 wires up ?date handling on the dashboard itself — until then the
 * link still takes the user to the dashboard; they just see today's data.)
 *
 * Everything is in UTC so the "day" key matches the dashboard's today-window.
 */

type MealRow = {
  logged_at: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  meal_name: string | null
}

type DayTotals = {
  dateKey: string // YYYY-MM-DD (UTC)
  date: Date // start of that UTC day, as a Date
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  mealCount: number
}

// How many days to render in the list (including today, inclusive).
const DAYS_TO_SHOW = 14
// How many days to plot on the small trend chart at the top.
const TREND_DAYS = 7

export default async function HistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  if (!profile || !profile.onboarded) redirect('/onboarding')

  // Build a [start, end) UTC window that covers the last DAYS_TO_SHOW days, ending
  // at the *end* of today (start of tomorrow). start is inclusive; end is exclusive.
  const now = new Date()
  const endOfWindow = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
  )
  const startOfWindow = new Date(endOfWindow)
  startOfWindow.setUTCDate(startOfWindow.getUTCDate() - DAYS_TO_SHOW)

  const { data: meals } = await supabase
    .from('meals')
    .select('logged_at, calories, protein_g, carbs_g, fat_g, meal_name')
    .eq('user_id', user.id)
    .gte('logged_at', startOfWindow.toISOString())
    .lt('logged_at', endOfWindow.toISOString())
    .order('logged_at', { ascending: false })
    .returns<MealRow[]>()

  // Ascending (oldest → newest) for the chart, descending for the cards.
  const daysAsc = buildDays(startOfWindow, DAYS_TO_SHOW, meals ?? [])
  const daysDesc = [...daysAsc].reverse()
  const trendDays = daysAsc.slice(-TREND_DAYS)

  const targetCalories = profile.target_calories ?? 2000

  // A tiny "this window" headline so empty states aren't confusing.
  const loggedDays = daysAsc.filter((d) => d.mealCount > 0).length
  const windowTotal = daysAsc.reduce((sum, d) => sum + d.calories, 0)
  const avgPerLoggedDay = loggedDays > 0 ? Math.round(windowTotal / loggedDays) : 0

  // Coach input — we feed Claude the last 14 daily totals, the user's targets,
  // their goal, current logging streak, and a flat list of recent meal names
  // (no macros) so it can reason about timing/variety patterns without the
  // prompt ballooning.
  const coachDays: CoachDaySummary[] = daysAsc.map((d) => ({
    dateKey: d.dateKey,
    weekday: shortWeekday(d.date),
    calories: Math.round(d.calories),
    protein_g: Math.round(d.protein_g),
    carbs_g: Math.round(d.carbs_g),
    fat_g: Math.round(d.fat_g),
    mealCount: d.mealCount,
  }))
  const coachStreak = computeStreak(daysAsc, now)
  const recentMealNames = (meals ?? [])
    .filter((m) => (m.meal_name ?? '').trim().length > 0)
    .slice(0, 20)
    .map((m) => ({ name: m.meal_name as string, logged_at: m.logged_at }))

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-4xl mx-auto anim-fade-up">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">History</h1>
          <p className="text-sm text-gray-600 mt-1">
            Your last {DAYS_TO_SHOW} days at a glance.
          </p>
        </div>

        {/* Window summary strip */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <SummaryStat
            label="Days logged"
            value={`${loggedDays}/${DAYS_TO_SHOW}`}
            tone="orange"
          />
          <SummaryStat
            label="Avg kcal / day"
            value={avgPerLoggedDay > 0 ? avgPerLoggedDay.toLocaleString() : '—'}
            tone="rose"
          />
          <SummaryStat
            label="Daily target"
            value={targetCalories.toLocaleString()}
            tone="amber"
          />
        </div>

        <TrendChart days={trendDays} target={targetCalories} />

        {/* Claude's weekly coach — Suspense-streamed so the page paints first */}
        <div className="mt-5">
          <Suspense fallback={<CoachCardSkeleton />}>
            <CoachCard
              days={coachDays}
              target={{
                calories: targetCalories,
                protein_g: profile.target_protein_g ?? 0,
                carbs_g: profile.target_carbs_g ?? 0,
                fat_g: profile.target_fat_g ?? 0,
              }}
              goal={(profile.goal as Goal) ?? 'maintain'}
              streak={coachStreak}
              recentMealNames={recentMealNames}
            />
          </Suspense>
        </div>

        <div className="space-y-3 mt-6">
          {daysDesc.map((d, i) => (
            <DayCard
              key={d.dateKey}
              day={d}
              target={targetCalories}
              isToday={isSameUtcDay(d.date, now)}
              index={i}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Data helpers
// ---------------------------------------------------------------------------

function isSameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  )
}

function toUtcDateKey(d: Date): string {
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Create one DayTotals entry per day in the window, then bucket each meal
 * into its matching UTC day. Returns days in ascending (oldest-first) order,
 * so slicing the tail gives us "the last N days".
 */
function buildDays(
  windowStart: Date,
  count: number,
  meals: MealRow[]
): DayTotals[] {
  const map = new Map<string, DayTotals>()

  for (let i = 0; i < count; i++) {
    const d = new Date(windowStart)
    d.setUTCDate(d.getUTCDate() + i)
    const key = toUtcDateKey(d)
    map.set(key, {
      dateKey: key,
      date: d,
      calories: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      mealCount: 0,
    })
  }

  for (const m of meals) {
    const d = new Date(m.logged_at)
    const key = toUtcDateKey(d)
    const entry = map.get(key)
    if (!entry) continue
    entry.calories += m.calories ?? 0
    entry.protein_g += Number(m.protein_g ?? 0)
    entry.carbs_g += Number(m.carbs_g ?? 0)
    entry.fat_g += Number(m.fat_g ?? 0)
    entry.mealCount += 1
  }

  return Array.from(map.values())
}

// ---------------------------------------------------------------------------
// Summary stat
// ---------------------------------------------------------------------------

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: 'orange' | 'rose' | 'amber'
}) {
  const toneStyles: Record<typeof tone, string> = {
    orange: 'text-orange-700',
    rose: 'text-rose-700',
    amber: 'text-amber-700',
  }
  return (
    <div className="rounded-2xl bg-white/70 backdrop-blur border border-white shadow-sm px-4 py-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className={`text-xl font-bold tabular-nums mt-0.5 ${toneStyles[tone]}`}>
        {value}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Trend chart — pure SVG line chart of the last N days' daily calorie totals
// ---------------------------------------------------------------------------

function TrendChart({ days, target }: { days: DayTotals[]; target: number }) {
  const W = 700
  const H = 220
  const padX = 28
  const padTop = 30
  const padBottom = 38
  const chartW = W - padX * 2
  const chartH = H - padTop - padBottom

  // Scale: leave 15% headroom above the max so the line has room to breathe.
  const dataMax = Math.max(...days.map((d) => d.calories), 0)
  const maxVal = Math.max(target, dataMax, 1) * 1.15

  const points = days.map((d, i) => {
    const x =
      days.length === 1
        ? padX + chartW / 2
        : padX + (i / (days.length - 1)) * chartW
    const y = padTop + chartH - (d.calories / maxVal) * chartH
    return { x, y, day: d }
  })

  const targetY = padTop + chartH - (target / maxVal) * chartH
  const pathD = smoothLine(points.map((p) => ({ x: p.x, y: p.y })))
  const first = points[0]
  const last = points[points.length - 1]
  const fillD =
    first && last
      ? `${pathD} L ${last.x.toFixed(2)},${(padTop + chartH).toFixed(2)} L ${first.x.toFixed(2)},${(padTop + chartH).toFixed(2)} Z`
      : ''

  const latest = days[days.length - 1]

  return (
    <div className="rounded-3xl bg-white/75 backdrop-blur-md border border-white shadow-sm p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900">
          {TREND_DAYS}-day trend
        </h2>
        <span className="text-xs text-gray-500">
          Target{' '}
          <span className="font-semibold text-gray-700">
            {target.toLocaleString()}
          </span>{' '}
          kcal
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-48" role="img" aria-label="Daily calorie trend">
        <defs>
          <linearGradient id="trendStroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f43f5e" />
          </linearGradient>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(251,146,60,0.28)" />
            <stop offset="100%" stopColor="rgba(251,146,60,0)" />
          </linearGradient>
        </defs>

        {/* Target line + label */}
        <line
          x1={padX}
          x2={W - padX}
          y1={targetY}
          y2={targetY}
          stroke="#9ca3af"
          strokeWidth="1"
          strokeDasharray="4 4"
        />
        <text
          x={W - padX}
          y={Math.max(targetY - 6, padTop - 4)}
          textAnchor="end"
          fontSize="10"
          fill="#6b7280"
        >
          target
        </text>

        {/* Filled area + stroke */}
        {fillD && (
          <path d={fillD} fill="url(#trendFill)" className="anim-area-fade" />
        )}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke="url(#trendStroke)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="anim-line-draw"
          />
        )}

        {/* Per-day dots + x-axis labels + latest-day value bubble */}
        {points.map((p, i) => {
          const over = p.day.calories > target && target > 0
          const isLast = i === points.length - 1
          return (
            <g key={p.day.dateKey}>
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? 5 : 3.5}
                fill="white"
                stroke={over ? '#e11d48' : '#fb923c'}
                strokeWidth="2"
              />
              <text
                x={p.x}
                y={H - padBottom + 14}
                textAnchor="middle"
                fontSize="10"
                fill="#6b7280"
              >
                {shortWeekday(p.day.date)}
              </text>
              <text
                x={p.x}
                y={H - padBottom + 26}
                textAnchor="middle"
                fontSize="9"
                fill="#9ca3af"
              >
                {p.day.date.getUTCDate()}
              </text>
              {isLast && latest && latest.calories > 0 && (
                <text
                  x={p.x}
                  y={p.y - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill={over ? '#e11d48' : '#ea580c'}
                  className="anim-pop-in"
                >
                  {latest.calories.toLocaleString()}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

/**
 * Build a smooth SVG path through the given points using Catmull-Rom-style
 * cubic Bézier control points. Keeps the curve anchored at each data point
 * (so the dots always sit on the line) while giving it a gentle shape.
 */
function smoothLine(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return ''
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`
  let d = `M ${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2.x.toFixed(2)},${p2.y.toFixed(2)}`
  }
  return d
}

function shortWeekday(d: Date): string {
  // 3-letter weekday in the user's locale, computed in UTC to match our day key.
  return d.toLocaleDateString(undefined, { weekday: 'short', timeZone: 'UTC' })
}

/**
 * Consecutive-day logging streak ending today (or yesterday if today's empty
 * and we want to show the "on-fire" streak they still have momentum on).
 *
 * We walk BACK from today; if today has no meal yet we still count an existing
 * yesterday-streak so the coach can say "4-day streak — today's fresh!" rather
 * than resetting to 0 before the user has even had breakfast.
 */
function computeStreak(daysAsc: DayTotals[], now: Date): number {
  if (daysAsc.length === 0) return 0
  const byKey = new Map(daysAsc.map((d) => [d.dateKey, d]))
  const todayKey = toUtcDateKey(
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  )
  const todayEntry = byKey.get(todayKey)
  // Start from yesterday if today is empty — that preserves the streak momentum.
  const cursor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )
  if (!todayEntry || todayEntry.mealCount === 0) {
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  let streak = todayEntry && todayEntry.mealCount > 0 ? 1 : 0
  while (true) {
    const key = toUtcDateKey(cursor)
    const entry = byKey.get(key)
    if (!entry || entry.mealCount === 0) break
    // Already counted today (if present); only add prior days here.
    if (key !== todayKey) streak += 1
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}

// ---------------------------------------------------------------------------
// Day card
// ---------------------------------------------------------------------------

function DayCard({
  day,
  target,
  isToday,
  index = 0,
}: {
  day: DayTotals
  target: number
  isToday: boolean
  index?: number
}) {
  const label = day.date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const isEmpty = day.mealCount === 0
  const cal = Math.round(day.calories)
  const calPct = target > 0 ? (cal / target) * 100 : 0
  const over = cal > target && target > 0

  // Always link to dashboard. If it's today, skip the query param so the
  // dashboard doesn't have to do anything special to render. For past days,
  // pass ?date=YYYY-MM-DD — Task #11 will wire this up on the dashboard side.
  const href = isToday ? '/dashboard' : `/dashboard?date=${day.dateKey}`

  return (
    <Link
      href={href}
      className="block group anim-fade-up"
      style={{ animationDelay: `${Math.min(index, 10) * 40}ms` }}
    >
      <div
        className={`rounded-2xl border backdrop-blur shadow-sm p-4 sm:p-5 transition group-hover:shadow-md group-hover:-translate-y-0.5 ${
          isEmpty ? 'bg-white/55 border-white/80' : 'bg-white/80 border-white'
        }`}
      >
        <div className="flex items-center gap-4">
          {/* Date column */}
          <div className="flex-shrink-0 w-32 sm:w-40">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-gray-900">{label}</span>
              {isToday && (
                <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold uppercase tracking-wide">
                  Today
                </span>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {isEmpty
                ? 'No meals'
                : `${day.mealCount} meal${day.mealCount === 1 ? '' : 's'}`}
            </div>
          </div>

          {/* Progress bar + numbers */}
          <div className="flex-1 min-w-0">
            {isEmpty ? (
              <div className="h-2 rounded-full bg-gray-100" />
            ) : (
              <div className="relative h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-500 ${
                    over
                      ? 'bg-gradient-to-r from-rose-500 to-rose-600'
                      : 'bg-gradient-to-r from-orange-400 to-rose-400'
                  }`}
                  style={{ width: `${Math.min(100, calPct)}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              {isEmpty ? (
                <span className="text-xs text-gray-400">—</span>
              ) : (
                <>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      over ? 'text-rose-600' : 'text-gray-900'
                    }`}
                  >
                    {cal.toLocaleString()}
                  </span>
                  <span className="text-xs text-gray-400 tabular-nums">
                    / {target.toLocaleString()} kcal
                  </span>
                  <span className="text-xs text-gray-500 tabular-nums hidden sm:inline">
                    {Math.round(day.protein_g)}g P · {Math.round(day.carbs_g)}g C ·{' '}
                    {Math.round(day.fat_g)}g F
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Chevron */}
          <svg
            className="flex-shrink-0 w-5 h-5 text-gray-300 group-hover:text-gray-500 transition-colors"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      </div>
    </Link>
  )
}
