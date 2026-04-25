import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import MealDetailActions from './meal-detail-actions'
import LoggedTime from './logged-time'
import { getUserTimezone, toDateKeyInTz } from '@/lib/timezone'

/**
 * Meal detail page — one-meal deep-dive.
 *
 * Shows the photo, Claude's analysis, macros, and editor/delete actions for
 * a single meal. Reached from the dashboard meal rows and (later) from the
 * history day view. RLS on `meals` already gates access by `user_id`, but we
 * filter explicitly as defense-in-depth and so a 404 is shown for someone
 * else's meal id rather than leaking its existence.
 */

type MealRow = {
  id: string
  image_url: string | null
  meal_name: string | null
  description: string | null
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  logged_at: string
  ai_raw_response: {
    confidence?: 'low' | 'medium' | 'high'
    notes?: string
  } | null
}

export default async function MealDetailPage(props: {
  params: Promise<{ id: string }>
}) {
  const { id } = await props.params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: meal } = await supabase
    .from('meals')
    .select(
      'id, image_url, meal_name, description, calories, protein_g, carbs_g, fat_g, logged_at, ai_raw_response'
    )
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<MealRow>()

  if (!meal) notFound()

  const tz = await getUserTimezone()
  const logged = new Date(meal.logged_at)
  const longDate = logged.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz,
  })
  const dateKey = toDateKeyInTz(logged, tz)
  const backHref = `/dashboard?date=${dateKey}`

  const confidence = meal.ai_raw_response?.confidence ?? null
  const notes = meal.ai_raw_response?.notes ?? null

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-3xl mx-auto anim-fade-up">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 mb-4"
        >
          <svg
            className="w-4 h-4"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path
              fillRule="evenodd"
              d="M12.79 14.77a.75.75 0 01-1.06.02l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 111.04 1.08L8.832 10l3.938 3.71a.75.75 0 01.02 1.06z"
              clipRule="evenodd"
            />
          </svg>
          Back to {longDate.split(',').slice(0, 1)[0]}
        </Link>

        {/* Hero photo */}
        <div className="rounded-3xl overflow-hidden border border-white shadow-lg mb-5 bg-white">
          {meal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meal.image_url}
              alt={meal.meal_name ?? 'Meal photo'}
              className="w-full h-64 sm:h-96 object-cover"
            />
          ) : (
            <div className="w-full h-64 sm:h-96 bg-gradient-to-br from-orange-100 via-amber-100 to-rose-100 flex items-center justify-center text-6xl sm:text-7xl">
              🍽️
            </div>
          )}
        </div>

        {/* Title + timestamp */}
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-orange-700/80">
            {longDate} <span className="text-gray-400">·</span>{' '}
            <LoggedTime iso={meal.logged_at} />
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
            {meal.meal_name ?? 'Untitled meal'}
          </h1>
        </div>

        {/* Macro cards */}
        <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-5">
          <MacroCard
            label="kcal"
            value={Math.round(meal.calories ?? 0)}
            tone="calories"
          />
          <MacroCard
            label="g protein"
            value={Math.round(Number(meal.protein_g ?? 0))}
            tone="protein"
          />
          <MacroCard
            label="g carbs"
            value={Math.round(Number(meal.carbs_g ?? 0))}
            tone="carbs"
          />
          <MacroCard
            label="g fat"
            value={Math.round(Number(meal.fat_g ?? 0))}
            tone="fat"
          />
        </div>

        {/* Description — what the user actually ate */}
        {meal.description && (
          <div className="rounded-2xl bg-white/75 backdrop-blur-md border border-white shadow-sm p-5 mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-500 mb-1">
              Description
            </p>
            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
              {meal.description}
            </p>
          </div>
        )}

        {/* Claude's read — confidence + notes from the vision/text call */}
        {(confidence || notes) && (
          <div className="rounded-2xl bg-gradient-to-br from-orange-50/70 via-amber-50/60 to-rose-50/70 border border-orange-100 shadow-sm p-5 mb-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-xs font-bold shadow-sm">
                C
              </span>
              <p className="text-sm font-semibold text-gray-900">
                Claude&apos;s read
              </p>
              {confidence && <ConfidenceBadge level={confidence} />}
            </div>
            {notes ? (
              <p className="text-sm text-gray-700 leading-relaxed">{notes}</p>
            ) : (
              <p className="text-xs text-gray-500 italic">
                No extra notes on this one.
              </p>
            )}
          </div>
        )}

        {/* Edit + Delete */}
        <MealDetailActions
          meal={{
            id: meal.id,
            meal_name: meal.meal_name ?? '',
            description: meal.description ?? '',
            calories: Math.round(meal.calories ?? 0),
            protein_g: Math.round(Number(meal.protein_g ?? 0)),
            carbs_g: Math.round(Number(meal.carbs_g ?? 0)),
            fat_g: Math.round(Number(meal.fat_g ?? 0)),
          }}
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Macro card
// ---------------------------------------------------------------------------

function MacroCard({
  value,
  label,
  tone,
}: {
  value: number
  label: string
  tone: 'calories' | 'protein' | 'carbs' | 'fat'
}) {
  const styles: Record<typeof tone, string> = {
    calories: 'from-orange-100 to-orange-50 text-orange-900 border-orange-100',
    protein: 'from-rose-100 to-rose-50 text-rose-900 border-rose-100',
    carbs: 'from-amber-100 to-amber-50 text-amber-900 border-amber-100',
    fat: 'from-emerald-100 to-emerald-50 text-emerald-900 border-emerald-100',
  }
  const labelColors: Record<typeof tone, string> = {
    calories: 'text-orange-700',
    protein: 'text-rose-700',
    carbs: 'text-amber-700',
    fat: 'text-emerald-700',
  }
  return (
    <div
      className={`rounded-2xl border bg-gradient-to-br p-3 sm:p-4 text-center shadow-sm ${styles[tone]}`}
    >
      <div className="text-xl sm:text-2xl font-bold tabular-nums">{value}</div>
      <div className={`text-[10px] sm:text-xs mt-0.5 ${labelColors[tone]}`}>
        {label}
      </div>
    </div>
  )
}

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-amber-100 text-amber-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-emerald-100 text-emerald-800',
  }
  const labels = {
    low: 'Low confidence',
    medium: 'Medium confidence',
    high: 'High confidence',
  }
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${styles[level]}`}
    >
      {labels[level]}
    </span>
  )
}
