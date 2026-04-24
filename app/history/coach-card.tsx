import {
  generateCoachInsights,
  type CoachDaySummary,
  type CoachIcon,
  type CoachInsights,
} from '@/lib/claude/coach'
import type { Goal } from '@/lib/nutrition/calculator'

/**
 * Claude's weekly coach card — async server component.
 *
 * Rendered inside a <Suspense> on /history so the rest of the page paints
 * immediately. A Claude API round-trip is 2–4s, which is fine to stream in
 * as long as the user sees their trend chart and day cards first.
 *
 * Everything below is cosmetic except the generateCoachInsights call — that's
 * the single source of truth for the copy shown to the user.
 */

export default async function CoachCard({
  days,
  target,
  goal,
  streak,
  recentMealNames,
}: {
  days: CoachDaySummary[]
  target: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  goal: Goal
  streak: number
  recentMealNames: Array<{ name: string; logged_at: string }>
}) {
  // Edge case: user has literally nothing logged in the window. Skip the API
  // call and show an encouraging, content-appropriate message instead of
  // asking Claude to generate insights from an empty dataset.
  const anyLogged = days.some((d) => d.mealCount > 0)
  if (!anyLogged) {
    return <EmptyCoachCard />
  }

  let insights: CoachInsights
  try {
    insights = await generateCoachInsights({
      days,
      target,
      goal,
      streak,
      recentMealNames,
    })
  } catch (err) {
    // Keep the page useful if the API key is missing or the call fails.
    console.error('[coach] failed to generate insights:', err)
    return <ErrorCoachCard />
  }

  return <CoachCardShell insights={insights} />
}

function CoachCardShell({ insights }: { insights: CoachInsights }) {
  const toneClass =
    insights.tone === 'cautionary'
      ? 'from-amber-50 via-orange-50 to-rose-50 border-amber-100'
      : insights.tone === 'neutral'
      ? 'from-orange-50/80 via-amber-50/60 to-white border-orange-100'
      : 'from-emerald-50 via-orange-50 to-rose-50 border-emerald-100'

  return (
    <section
      className={`rounded-3xl border bg-gradient-to-br ${toneClass} shadow-sm p-5 sm:p-6 anim-fade-up`}
      aria-label="Claude's weekly coach"
    >
      <header className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-sm font-bold shadow-sm">
          C
        </span>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80">
            Claude&apos;s read on your week
          </p>
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 leading-snug">
            {insights.headline}
          </h2>
        </div>
      </header>

      <ul className="space-y-2.5">
        {insights.observations.map((o, i) => (
          <li key={i} className="flex gap-2.5 items-start">
            <span className="mt-0.5 shrink-0">
              <CoachGlyph icon={o.icon} />
            </span>
            <p className="text-sm text-gray-800 leading-relaxed">{o.text}</p>
          </li>
        ))}
      </ul>

      {insights.suggestion && (
        <div className="mt-4 rounded-2xl border border-white/80 bg-white/70 backdrop-blur p-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80 mb-1">
            Gentle nudge
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">
            {insights.suggestion.text}
          </p>
          {insights.suggestion.action && (
            <p className="text-xs text-gray-600 mt-1.5 italic">
              Try: {insights.suggestion.action}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Skeleton — shown via <Suspense fallback> while the Claude call is in flight
// ---------------------------------------------------------------------------

export function CoachCardSkeleton() {
  return (
    <section
      className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/80 via-amber-50/60 to-white shadow-sm p-5 sm:p-6 anim-fade-up"
      aria-label="Loading Claude's weekly coach"
    >
      <header className="flex items-center gap-2.5 mb-3">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-sm font-bold shadow-sm">
          C
        </span>
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80">
            Claude&apos;s read on your week
          </p>
          <div className="mt-1 h-4 w-3/5 bg-orange-100/70 rounded animate-pulse" />
        </div>
      </header>

      <div className="space-y-2.5">
        <SkelRow />
        <SkelRow width="w-5/6" />
        <SkelRow width="w-4/6" />
      </div>

      <p className="mt-4 text-xs text-orange-700/70 italic">
        Claude is reading your week…
      </p>
    </section>
  )
}

function SkelRow({ width = 'w-full' }: { width?: string }) {
  return (
    <div className="flex gap-2.5 items-center">
      <div className="w-5 h-5 rounded-full bg-orange-100/70 animate-pulse shrink-0" />
      <div className={`h-3.5 ${width} bg-orange-100/70 rounded animate-pulse`} />
    </div>
  )
}

function EmptyCoachCard() {
  return (
    <section className="rounded-3xl border border-orange-100 bg-gradient-to-br from-orange-50/80 via-amber-50/60 to-white shadow-sm p-5 sm:p-6">
      <header className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-sm font-bold shadow-sm">
          C
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80">
          Claude&apos;s read on your week
        </p>
      </header>
      <p className="text-sm text-gray-800 leading-relaxed">
        Log a couple of meals and I&apos;ll start spotting patterns for you —
        protein trends, weekend habits, and gentle ideas for the week ahead.
      </p>
    </section>
  )
}

function ErrorCoachCard() {
  return (
    <section className="rounded-3xl border border-gray-200 bg-white/70 backdrop-blur shadow-sm p-5 sm:p-6">
      <header className="flex items-center gap-2.5 mb-2">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gray-400 text-white text-sm font-bold">
          C
        </span>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">
          Claude&apos;s read on your week
        </p>
      </header>
      <p className="text-sm text-gray-700">
        Couldn&apos;t generate this week&apos;s read. Try again in a moment.
      </p>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Glyphs — small inline SVGs keyed by the icon enum from the tool schema.
// Using SVG (not an emoji or icon font) so they sit neatly on the line and
// inherit the gradient tone from the surrounding card.
// ---------------------------------------------------------------------------

function CoachGlyph({ icon }: { icon: CoachIcon }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (icon) {
    case 'target':
      return (
        <svg {...common} className="text-emerald-600" aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" />
        </svg>
      )
    case 'trending-up':
      return (
        <svg {...common} className="text-emerald-600" aria-hidden>
          <path d="M3 17l6-6 4 4 7-7" />
          <path d="M14 8h6v6" />
        </svg>
      )
    case 'trending-down':
      return (
        <svg {...common} className="text-rose-500" aria-hidden>
          <path d="M3 7l6 6 4-4 7 7" />
          <path d="M14 16h6v-6" />
        </svg>
      )
    case 'flame':
      return (
        <svg {...common} className="text-orange-500" aria-hidden>
          <path d="M12 2c0 3-4 5-4 9a4 4 0 008 0c0-1.5-1-3-2-4 0 2-1 3-2 3 0-3 2-5 0-8z" />
        </svg>
      )
    case 'leaf':
      return (
        <svg {...common} className="text-emerald-600" aria-hidden>
          <path d="M5 19c6 0 14-4 14-14 0 0-6-1-10 3s-4 11-4 11z" />
          <path d="M5 19l6-6" />
        </svg>
      )
    case 'warning':
      return (
        <svg {...common} className="text-amber-600" aria-hidden>
          <path d="M12 3l10 18H2L12 3z" />
          <path d="M12 10v4" />
          <circle cx="12" cy="17" r="0.5" fill="currentColor" />
        </svg>
      )
    case 'sparkles':
      return (
        <svg {...common} className="text-amber-500" aria-hidden>
          <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3z" />
          <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
        </svg>
      )
    case 'balance':
      return (
        <svg {...common} className="text-orange-500" aria-hidden>
          <path d="M12 3v18" />
          <path d="M4 7h16" />
          <path d="M7 7l-3 6a3 3 0 006 0L7 7z" />
          <path d="M17 7l-3 6a3 3 0 006 0L17 7z" />
        </svg>
      )
  }
}
