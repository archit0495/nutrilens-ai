import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ACTIVITY_LABELS, GOAL_LABELS, type ActivityLevel, type Goal } from '@/lib/nutrition/calculator'
import MealRow from './meal-row'
import CountUp from '@/app/components/count-up'
import {
  addDaysInTz,
  formatLongDateInTz,
  getUserTimezone,
  parseDateKeyInTz,
  startOfDayInTz,
  toDateKeyInTz,
} from '@/lib/timezone'

type Meal = {
  id: string
  image_url: string | null
  meal_name: string | null
  description: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  logged_at: string
}

/**
 * Dashboard — shows the selected day's meal log + targets.
 *
 * `?date=YYYY-MM-DD` lets the user scrub to past days. Date keys are computed
 * in the user's local timezone (read from the `nl_tz` cookie set by
 * `<TimezoneSync />`) so /dashboard, /history, and the streak badge all agree
 * on what "today" is. No date param → today. Dates that fail to parse or sit
 * in the future → silently fall back to today so a bad link doesn't break the
 * app.
 */
export default async function DashboardPage(props: {
  searchParams: Promise<{ date?: string }>
}) {
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

  if (!profile || !profile.onboarded) {
    redirect('/onboarding')
  }

  // ------------------------------------------------------------------
  // Resolve "which day are we looking at?" — anchored to the user's local
  // timezone (read from the `nl_tz` cookie). Falls back to UTC if the cookie
  // hasn't been written yet.
  // ------------------------------------------------------------------
  const tz = await getUserTimezone()
  const now = new Date()
  const todayStart = startOfDayInTz(now, tz)

  const rawDateParam = (await props.searchParams).date ?? ''
  const parsed = parseDateKeyInTz(rawDateParam, tz)
  // Clamp future dates back to today.
  const selectedStart =
    parsed && parsed.getTime() <= todayStart.getTime() ? parsed : todayStart

  const selectedEnd = addDaysInTz(selectedStart, 1, tz)

  const isToday = selectedStart.getTime() === todayStart.getTime()
  const selectedKey = toDateKeyInTz(selectedStart, tz)
  const prevKey = toDateKeyInTz(addDaysInTz(selectedStart, -1, tz), tz)
  const nextStart = addDaysInTz(selectedStart, 1, tz)
  // Guard: only enable "next" if it wouldn't take us past today.
  const nextKey =
    nextStart.getTime() <= todayStart.getTime() ? toDateKeyInTz(nextStart, tz) : null

  // ------------------------------------------------------------------
  // Fetch meals for the selected [start, end) window.
  // ------------------------------------------------------------------
  const { data: meals } = await supabase
    .from('meals')
    .select(
      'id, image_url, meal_name, description, calories, protein_g, carbs_g, fat_g, logged_at'
    )
    .eq('user_id', user.id)
    .gte('logged_at', selectedStart.toISOString())
    .lt('logged_at', selectedEnd.toISOString())
    .order('logged_at', { ascending: false })
    .returns<Meal[]>()

  const dayMeals: Meal[] = meals ?? []

  const totals = dayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + (m.calories ?? 0),
      protein_g: acc.protein_g + Number(m.protein_g ?? 0),
      carbs_g: acc.carbs_g + Number(m.carbs_g ?? 0),
      fat_g: acc.fat_g + Number(m.fat_g ?? 0),
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  )

  const longDate = formatLongDateInTz(selectedStart, tz)

  return (
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto p-4 sm:p-8 anim-fade-up">
        {/* Date navigator (prev/next + jump-to-today) + greeting */}
        <div className="mb-6">
          <DateNav
            label={longDate}
            isToday={isToday}
            prevKey={prevKey}
            nextKey={nextKey}
            selectedKey={selectedKey}
          />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-3">
            {isToday ? (
              <>Hi, {profile.full_name || 'there'} 👋</>
            ) : (
              <>Looking back</>
            )}
          </h1>
        </div>

        {/* Hero: calorie tracker */}
        <CalorieHero
          current={totals.calories}
          target={profile.target_calories}
          goalLabel={GOAL_LABELS[profile.goal as Goal]}
          isToday={isToday}
          protein={{ current: Math.round(totals.protein_g), target: profile.target_protein_g }}
          carbs={{ current: Math.round(totals.carbs_g), target: profile.target_carbs_g }}
          fat={{ current: Math.round(totals.fat_g), target: profile.target_fat_g }}
        />

        {/* Macro rings */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
          <MacroRing
            label="Protein"
            current={Math.round(totals.protein_g)}
            target={profile.target_protein_g}
            unit="g"
            color={MACRO_COLORS.protein}
          />
          <MacroRing
            label="Carbs"
            current={Math.round(totals.carbs_g)}
            target={profile.target_carbs_g}
            unit="g"
            color={MACRO_COLORS.carbs}
          />
          <MacroRing
            label="Fat"
            current={Math.round(totals.fat_g)}
            target={profile.target_fat_g}
            unit="g"
            color={MACRO_COLORS.fat}
          />
        </div>

        {/* Meals for the selected day */}
        <div className="bg-white/70 backdrop-blur rounded-3xl shadow-sm border border-white p-5 sm:p-6 mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              {isToday ? 'Today\u2019s meals' : 'Meals on this day'}
              {dayMeals.length > 0 && (
                <span className="text-sm font-normal text-gray-500 ml-1.5">
                  ({dayMeals.length})
                </span>
              )}
            </h2>
            {isToday && dayMeals.length > 0 && (
              <Link
                href="/log-meal"
                className="text-sm font-medium text-orange-600 hover:text-orange-700"
              >
                + Log another
              </Link>
            )}
          </div>

          {dayMeals.length === 0 ? (
            <div className="text-center py-10">
              <div className="text-4xl mb-3">🍽️</div>
              <p className="text-sm text-gray-600 mb-4">
                {isToday
                  ? 'Nothing logged yet today.'
                  : 'No meals were logged on this day.'}
              </p>
              {isToday ? (
                <Link
                  href="/log-meal"
                  className="inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-medium shadow-sm hover:shadow-md transition"
                >
                  Log your first meal
                </Link>
              ) : (
                <Link
                  href="/dashboard"
                  className="inline-block px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white text-sm font-medium shadow-sm hover:shadow-md transition"
                >
                  Back to today →
                </Link>
              )}
            </div>
          ) : (
            <ul className="space-y-3">
              {dayMeals.map((meal, i) => (
                <MealRow key={meal.id} meal={meal} index={i} />
              ))}
            </ul>
          )}
        </div>

        {/* Profile summary — your stats at a glance, with an edit shortcut. */}
        <ProfileCard
          fullName={profile.full_name || 'there'}
          age={profile.age}
          sex={profile.sex as 'male' | 'female'}
          heightCm={profile.height_cm}
          weightKg={profile.weight_kg}
          activityLevel={profile.activity_level as ActivityLevel}
          goalLabel={GOAL_LABELS[profile.goal as Goal]}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Date navigator — prev/next chevrons, date kicker, optional Today CTA.
// ---------------------------------------------------------------------------

function DateNav({
  label,
  isToday,
  prevKey,
  nextKey,
  selectedKey,
}: {
  label: string
  isToday: boolean
  prevKey: string
  nextKey: string | null
  selectedKey: string
}) {
  const prevHref = `/dashboard?date=${prevKey}`
  const nextHref = nextKey ? `/dashboard?date=${nextKey}` : null

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <Link
        href={prevHref}
        aria-label={`Previous day (${prevKey})`}
        className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 backdrop-blur border border-white text-gray-700 hover:bg-white hover:text-gray-900 transition shadow-sm"
      >
        <Chevron dir="left" />
      </Link>

      <div className="flex items-center gap-2 min-w-0">
        <p className="text-xs sm:text-sm font-semibold uppercase tracking-widest text-orange-700/80 truncate">
          {label}
        </p>
        {isToday && (
          <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-full font-semibold uppercase tracking-wide">
            Today
          </span>
        )}
      </div>

      {nextHref ? (
        <Link
          href={nextHref}
          aria-label={`Next day (${nextKey})`}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/70 backdrop-blur border border-white text-gray-700 hover:bg-white hover:text-gray-900 transition shadow-sm"
        >
          <Chevron dir="right" />
        </Link>
      ) : (
        <span
          aria-hidden
          title={`Viewing ${selectedKey}`}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-white/40 text-gray-300 border border-white/60"
        >
          <Chevron dir="right" />
        </span>
      )}

      {!isToday && (
        <Link
          href="/dashboard"
          className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-sm hover:shadow-md transition whitespace-nowrap"
        >
          Jump to today →
        </Link>
      )}
    </div>
  )
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg
      className="w-4 h-4"
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      {dir === 'left' ? (
        <path
          fillRule="evenodd"
          d="M12.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.832 10l3.938 3.71a.75.75 0 01.02 1.06z"
          clipRule="evenodd"
        />
      ) : (
        <path
          fillRule="evenodd"
          d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
          clipRule="evenodd"
        />
      )}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Calorie hero — gradient card with big ring + remaining kcal + CTA
// ---------------------------------------------------------------------------

type MacroTotal = { current: number; target: number }

function CalorieHero({
  current,
  target,
  goalLabel,
  isToday,
  protein,
  carbs,
  fat,
}: {
  current: number
  target: number
  goalLabel: string
  isToday: boolean
  protein: MacroTotal
  carbs: MacroTotal
  fat: MacroTotal
}) {
  const remaining = Math.max(0, target - current)
  const over = current > target
  const overBy = over ? current - target : 0
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0

  // Status copy changes a bit when we're looking at a past day —
  // there's no "ready to start" since the day's already over.
  let status: string
  let statusColor: string
  if (over) {
    status = `Over by ${overBy} kcal`
    statusColor = 'text-rose-700 bg-rose-100'
  } else if (remaining < target * 0.15 && current > 0) {
    status = isToday ? 'Almost at your goal' : 'Close to the target'
    statusColor = 'text-amber-700 bg-amber-100'
  } else if (current === 0) {
    status = isToday ? 'Ready to start the day' : 'No intake logged'
    statusColor = 'text-orange-700 bg-orange-100'
  } else if (isToday) {
    status = 'On track'
    statusColor = 'text-emerald-700 bg-emerald-100'
  } else {
    status = 'Under target'
    statusColor = 'text-emerald-700 bg-emerald-100'
  }

  const r = 52
  const C = 2 * Math.PI * r
  const offset = C * (1 - pct / 100)

  // On past days there's no "Still to go" column, so the hero collapses to
  // two columns. Using a grid lets us keep the ring's width fixed while the
  // middle column flexes, and reveal the remaining panel only when needed.
  const showRemaining = isToday

  return (
    <div className="relative rounded-3xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 p-[1px] shadow-lg mb-6">
      <div className="rounded-3xl bg-white/85 backdrop-blur-md p-5 sm:p-7">
        <div
          className={`flex flex-col sm:grid sm:items-center gap-5 sm:gap-6 ${
            showRemaining
              ? 'sm:grid-cols-[auto_1fr_auto]'
              : 'sm:grid-cols-[auto_1fr]'
          }`}
        >
          {/* Ring */}
          <div className="relative w-36 h-36 sm:w-40 sm:h-40 flex-shrink-0 justify-self-center sm:justify-self-start">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <defs>
                <linearGradient id="heroGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fb923c" />
                  <stop offset="50%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#f43f5e" />
                </linearGradient>
              </defs>
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke="#fee4d1"
                strokeWidth="10"
              />
              <circle
                cx="60"
                cy="60"
                r={r}
                fill="none"
                stroke={over ? '#e11d48' : 'url(#heroGradient)'}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={C}
                strokeDashoffset={offset}
                className="transition-all duration-700 anim-ring-draw"
                style={{ ['--ring-circumference' as string]: String(C) }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
              {over ? (
                <>
                  <CountUp
                    value={overBy}
                    className="text-3xl sm:text-4xl font-bold text-rose-600"
                    prefix="+"
                  />
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mt-0.5">
                    kcal over
                  </span>
                </>
              ) : (
                <>
                  <CountUp
                    value={remaining}
                    className="text-3xl sm:text-4xl font-bold text-gray-900"
                  />
                  <span className="text-[10px] sm:text-xs text-gray-500 uppercase tracking-wider mt-0.5">
                    {isToday ? 'kcal left' : 'kcal under'}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Middle column — status + kcal numbers + goal + CTA.                */}
          {/* Typography here used to feel weak next to the big ring; bumped    */}
          {/* the tally to text-base and goal line to text-sm for balance.      */}
          <div className="w-full text-center sm:text-left min-w-0">
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${statusColor}`}
            >
              {status}
            </span>
            <div className="mt-3">
              <div className="text-base sm:text-lg text-gray-700 leading-snug">
                <CountUp
                  value={current}
                  className="font-bold text-gray-900"
                />
                <span className="text-gray-400">
                  {' of '}
                  {target.toLocaleString()} kcal
                </span>
              </div>
              <div className="text-sm text-gray-600 mt-1">
                Goal:{' '}
                <span className="font-semibold text-gray-800">{goalLabel}</span>
              </div>
            </div>

            {isToday ? (
              <Link
                href="/log-meal"
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition"
              >
                <span>📸</span>
                <span>Log a meal</span>
              </Link>
            ) : (
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full bg-white border border-gray-200 text-gray-800 font-medium shadow-sm hover:shadow-md transition"
              >
                <span>↩</span>
                <span>Back to today</span>
              </Link>
            )}
          </div>

          {/* Right column — "Still to go" macros. Fills the empty space the   */}
          {/* right side of the hero used to have. Answers "what should I log  */}
          {/* next?" Hidden on past-day views since "remaining" isn't actionable*/}
          {/* for a day already in the rearview.                                */}
          {showRemaining && (
            <div className="w-full sm:w-auto sm:min-w-[10rem] rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-rose-50/60 p-3 sm:p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80 mb-2">
                Still to go
              </p>
              <div className="flex flex-wrap sm:flex-col gap-1.5 justify-center sm:justify-start sm:items-stretch">
                <MacroRemainingChip
                  tone="protein"
                  letter="P"
                  current={protein.current}
                  target={protein.target}
                />
                <MacroRemainingChip
                  tone="carbs"
                  letter="C"
                  current={carbs.current}
                  target={carbs.target}
                />
                <MacroRemainingChip
                  tone="fat"
                  letter="F"
                  current={fat.current}
                  target={fat.target}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Macro ring — small card with circular ring + label + current/target
// ---------------------------------------------------------------------------

type MacroColor = {
  stroke: string
  trackStroke: string
  accentText: string
}

const MACRO_COLORS: Record<'protein' | 'carbs' | 'fat', MacroColor> = {
  protein: {
    stroke: '#f43f5e',
    trackStroke: '#ffe4e6',
    accentText: 'text-rose-600',
  },
  carbs: {
    stroke: '#f59e0b',
    trackStroke: '#fef3c7',
    accentText: 'text-amber-600',
  },
  fat: {
    stroke: '#10b981',
    trackStroke: '#d1fae5',
    accentText: 'text-emerald-600',
  },
}

function MacroRing({
  label,
  current,
  target,
  unit,
  color,
}: {
  label: string
  current: number
  target: number
  unit: string
  color: MacroColor
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
  const over = current > target
  const r = 38
  const C = 2 * Math.PI * r
  const rawPct = target > 0 ? Math.min(100, (current / target) * 100) : 0
  const offset = C * (1 - rawPct / 100)

  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur border border-white shadow-sm p-3 sm:p-4">
      <div className="relative w-14 h-14 sm:w-16 sm:h-16 mx-auto">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={color.trackStroke}
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={over ? '#e11d48' : color.stroke}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={offset}
            className="transition-all duration-700 anim-ring-draw"
            style={{ ['--ring-circumference' as string]: String(C) }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-xs sm:text-sm font-bold ${over ? 'text-rose-600' : color.accentText}`}
          >
            {pct}%
          </span>
        </div>
      </div>
      <div className="text-center mt-2">
        <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div className="text-sm mt-0.5 whitespace-nowrap">
          <span className="font-bold text-gray-900">{current}</span>
          <span className="text-gray-400">
            {' / '}
            {target}
            {unit}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Remaining-by-macro chip — small pill showing how much of a macro is left
// for today. Switches to a rose "over by Xg" state once the target is hit.
// ---------------------------------------------------------------------------

type MacroTone = 'protein' | 'carbs' | 'fat'

const MACRO_CHIP_STYLES: Record<MacroTone, { base: string; body: string }> = {
  protein: {
    base: 'bg-rose-50 text-rose-700 border-rose-100',
    body: 'text-rose-900',
  },
  carbs: {
    base: 'bg-amber-50 text-amber-700 border-amber-100',
    body: 'text-amber-900',
  },
  fat: {
    base: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    body: 'text-emerald-900',
  },
}

function MacroRemainingChip({
  tone,
  letter,
  current,
  target,
}: {
  tone: MacroTone
  letter: 'P' | 'C' | 'F'
  current: number
  target: number
}) {
  const remaining = target - current
  const met = remaining === 0 && target > 0
  const over = remaining < 0

  // Color: rose when over (regardless of macro), macro's own palette
  // when still under, emerald when exactly met.
  const cls = over
    ? 'bg-rose-100 text-rose-800 border-rose-200'
    : met
    ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
    : MACRO_CHIP_STYLES[tone].base

  let body: string
  let labelText: string
  if (over) {
    body = `+${Math.abs(remaining)}g`
    labelText = `${letter} over`
  } else if (met) {
    body = '✓'
    labelText = `${letter} done`
  } else {
    body = `${remaining}g`
    labelText = `${letter} left`
  }

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${cls}`}
      aria-label={`${labelText}: ${body}`}
      title={`${current} / ${target}g`}
    >
      <span className="font-bold tabular-nums">{body}</span>
      <span className="opacity-80">{labelText}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Profile summary — your stats at a glance, with a shortcut to /profile.
// Sits at the bottom of the dashboard so it doesn't compete with the hero,
// but the details stay visible without requiring a separate page visit.
// ---------------------------------------------------------------------------

function ProfileCard({
  fullName,
  age,
  sex,
  heightCm,
  weightKg,
  activityLevel,
  goalLabel,
}: {
  fullName: string
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
  activityLevel: ActivityLevel
  goalLabel: string
}) {
  const feet = Math.floor(heightCm / 30.48)
  const inches = Math.round((heightCm / 2.54) - feet * 12)
  const heightLabel = `${heightCm}cm · ${feet}'${inches}"`
  const weightLabel = `${weightKg}kg · ${Math.round(weightKg * 2.2046)}lb`
  const sexLabel = sex === 'male' ? 'Male' : 'Female'

  return (
    <div className="bg-white/70 backdrop-blur rounded-3xl shadow-sm border border-white p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-900">Your profile</h2>
          <p className="text-xs text-gray-500 mt-0.5 truncate">
            {fullName !== 'there' ? fullName : 'Tap edit to personalize'} · {goalLabel}
          </p>
        </div>
        <Link
          href="/profile"
          className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-orange-600 hover:text-orange-700"
        >
          Edit →
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <ProfileStat label="Age" value={`${age}`} suffix="yrs" />
        <ProfileStat label="Sex" value={sexLabel} />
        <ProfileStat label="Height" value={heightLabel} />
        <ProfileStat label="Weight" value={weightLabel} />
      </div>

      <div className="mt-3 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-rose-50/60 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
          Activity level
        </div>
        <div className="text-sm font-medium text-gray-900 mt-0.5">
          {ACTIVITY_LABELS[activityLevel]}
        </div>
      </div>
    </div>
  )
}

function ProfileStat({
  label,
  value,
  suffix,
}: {
  label: string
  value: string
  suffix?: string
}) {
  return (
    <div className="rounded-2xl border border-white bg-white/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-base sm:text-lg font-bold text-gray-900 tabular-nums leading-none">
          {value}
        </span>
        {suffix && (
          <span className="text-xs text-gray-500 font-medium">{suffix}</span>
        )}
      </div>
    </div>
  )
}
