import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

/**
 * Public landing page.
 *
 * Authenticated users still bounce straight to /dashboard — this is only shown
 * to first-time/anonymous visitors. Styling leans on the same warm mesh
 * gradient that's applied globally in app/layout.tsx, so the page inherits the
 * rest of the app's look without having to re-declare the backdrop here.
 */
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    redirect('/dashboard')
  }

  return (
    <main className="min-h-screen">
      {/* ---------- Minimal landing header (TopNav is hidden on /) ---------- */}
      <header className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 sm:pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 text-lg shadow-sm">
            🥗
          </span>
          <span className="font-bold text-gray-900 text-lg tracking-tight">
            NutriLens AI
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-medium text-gray-700 hover:text-gray-900 px-3 py-1.5 rounded-full hover:bg-white/60 transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-10 sm:pb-14">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-10 lg:gap-12 items-center">
          <div className="anim-fade-up">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold uppercase tracking-widest text-orange-700 bg-orange-100/80 border border-orange-200/60">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
              Powered by Claude
            </span>
            <h1 className="mt-4 text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-gray-900 leading-[1.05]">
              Snap your plate.
              <br />
              <span className="bg-gradient-to-r from-orange-500 via-amber-500 to-rose-500 bg-clip-text text-transparent">
                Track your macros.
              </span>
            </h1>
            <p className="mt-5 text-base sm:text-lg text-gray-700 max-w-xl leading-relaxed">
              Skip the weighing, the lookup tables, and the guesswork. Take a
              photo of a meal — Claude identifies the food, estimates portions,
              and logs the calories and macros for you in seconds.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition"
              >
                <span>Get started</span>
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white/75 backdrop-blur border border-white shadow-sm hover:shadow-md text-gray-800 font-medium transition"
              >
                <span>Sign in</span>
              </Link>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-gray-600">
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> No calorie counting
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> Just a photo
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CheckDot /> Free during beta
              </span>
            </div>
          </div>

          {/* ---------- Decorative hero mockup ---------- */}
          <div className="anim-fade-up" style={{ animationDelay: '120ms' }}>
            <HeroMockup />
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="text-center mb-8 sm:mb-10">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-700/80">
            How it works
          </p>
          <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Three taps to a logged meal
          </h2>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 sm:gap-5">
          <StepCard
            index={1}
            icon="📸"
            title="Snap"
            body="Take a photo of whatever's in front of you. A phone shot works — no special lighting, no food scale."
          />
          <StepCard
            index={2}
            icon="🤖"
            title="Claude reads it"
            body="Claude identifies each item, estimates portion sizes from context, and computes calories and macros."
          />
          <StepCard
            index={3}
            icon="📊"
            title="Track"
            body="See your rings fill in. A weekly coach spots patterns so you can adjust without obsessing over numbers."
          />
        </div>
      </section>

      {/* ---------- Feature strip ---------- */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <div className="grid md:grid-cols-2 gap-4 sm:gap-5">
          <FeatureCard
            tone="orange"
            eyebrow="Vision, not forms"
            title="No more food databases"
            body="Search &quot;grilled chicken breast, 4oz&quot;? That's not how eating works. Claude reads the whole plate at once and tells you what it sees."
          />
          <FeatureCard
            tone="rose"
            eyebrow="Weekly coach"
            title="Claude reads your week"
            body="Every time you open History, you get a short, specific read on your patterns — protein trends, weekend habits, gentle ideas for the week ahead. No moralizing."
          />
          <FeatureCard
            tone="amber"
            eyebrow="Personalized targets"
            title="Goals tuned to you"
            body="Your calorie and macro targets are calculated from your stats, activity level, and whether you're looking to lose, maintain, or gain."
          />
          <FeatureCard
            tone="emerald"
            eyebrow="Your data, your way"
            title="Edit anything, anytime"
            body="Claude's guess close but not perfect? Tap a meal to tweak the macros. Your history stays accurate without any of the friction."
          />
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-16 pt-6 sm:pt-8">
        <div className="relative rounded-3xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 p-[1px] shadow-lg">
          <div className="rounded-3xl bg-white/85 backdrop-blur-md p-7 sm:p-10 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
              Ready to ditch the food diary?
            </h2>
            <p className="mt-3 text-sm sm:text-base text-gray-700 max-w-xl mx-auto">
              Create an account in 30 seconds. Log your first meal with a photo
              and see it break down in front of you.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white font-medium shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition"
            >
              <span>Start tracking</span>
              <span aria-hidden>→</span>
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-gray-500">
          Built with Next.js, Supabase, and the Claude API.
        </p>
      </section>
    </main>
  )
}

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function CheckDot() {
  return (
    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-600">
      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3">
        <path
          fillRule="evenodd"
          d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.414 0l-3.5-3.5a1 1 0 111.414-1.414l2.793 2.793 6.793-6.793a1 1 0 011.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  )
}

function StepCard({
  index,
  icon,
  title,
  body,
}: {
  index: number
  icon: string
  title: string
  body: string
}) {
  return (
    <div
      className="relative rounded-3xl bg-white/75 backdrop-blur-md border border-white shadow-sm p-5 sm:p-6 anim-fade-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-100 to-rose-100 text-xl shadow-inner">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-orange-700/80">
          Step {index}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      <p className="mt-1.5 text-sm text-gray-700 leading-relaxed">{body}</p>
    </div>
  )
}

type FeatureTone = 'orange' | 'rose' | 'amber' | 'emerald'

const FEATURE_TONES: Record<FeatureTone, { eyebrow: string; ring: string }> = {
  orange: { eyebrow: 'text-orange-700', ring: 'from-orange-200/60 to-white' },
  rose: { eyebrow: 'text-rose-700', ring: 'from-rose-200/60 to-white' },
  amber: { eyebrow: 'text-amber-700', ring: 'from-amber-200/60 to-white' },
  emerald: { eyebrow: 'text-emerald-700', ring: 'from-emerald-200/60 to-white' },
}

function FeatureCard({
  tone,
  eyebrow,
  title,
  body,
}: {
  tone: FeatureTone
  eyebrow: string
  title: string
  body: string
}) {
  const styles = FEATURE_TONES[tone]
  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${styles.ring} border border-white shadow-sm p-5 sm:p-6`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-widest ${styles.eyebrow}`}
      >
        {eyebrow}
      </p>
      <h3 className="mt-2 text-lg sm:text-xl font-semibold text-gray-900">
        {title}
      </h3>
      <p className="mt-2 text-sm text-gray-700 leading-relaxed">{body}</p>
    </div>
  )
}

/**
 * Decorative "look what it makes" mockup next to the hero copy.
 *
 * Pure SVG/JSX so we don't have to bundle a screenshot asset or wait on an
 * image round-trip. Mirrors the real dashboard's calorie ring + status chip +
 * "Still to go" breakdown so the marketing page matches what users actually
 * see after signing in.
 */
function HeroMockup() {
  const r = 52
  const C = 2 * Math.PI * r
  const pct = 68 // purely illustrative
  const offset = C * (1 - pct / 100)

  return (
    <div className="relative">
      {/* Soft glow behind the card */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[40px] bg-gradient-to-br from-orange-300/25 via-amber-200/20 to-rose-300/25 blur-2xl"
      />

      <div className="rounded-3xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 p-[1px] shadow-2xl">
        <div className="rounded-3xl bg-white/90 backdrop-blur-md p-5 sm:p-6">
          {/* Fake top bar to feel like a screenshot */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-300/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-amber-300/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-300/80" />
            <span className="ml-auto text-[10px] font-semibold uppercase tracking-widest text-orange-700/80">
              Today
            </span>
          </div>

          <div className="flex items-center gap-5">
            {/* Ring */}
            <div className="relative w-28 h-28 sm:w-32 sm:h-32 flex-shrink-0">
              <svg
                className="w-full h-full -rotate-90"
                viewBox="0 0 120 120"
                aria-hidden
              >
                <defs>
                  <linearGradient
                    id="landingRing"
                    x1="0"
                    y1="0"
                    x2="1"
                    y2="1"
                  >
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
                  stroke="url(#landingRing)"
                  strokeWidth="10"
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={offset}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-2xl sm:text-3xl font-bold text-gray-900 tabular-nums">
                  640
                </span>
                <span className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">
                  kcal left
                </span>
              </div>
            </div>

            {/* Status + totals */}
            <div className="flex-1 min-w-0">
              <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-semibold text-emerald-700 bg-emerald-100">
                On track
              </span>
              <div className="mt-2 text-sm text-gray-700 leading-snug">
                <span className="font-bold text-gray-900 tabular-nums">
                  1,360
                </span>
                <span className="text-gray-400"> of 2,000 kcal</span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">Goal: Maintain</div>
            </div>
          </div>

          {/* Fake "Still to go" chips */}
          <div className="mt-4 rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50/80 to-rose-50/60 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-orange-700/80 mb-2">
              Still to go
            </p>
            <div className="flex flex-wrap gap-1.5">
              <MockChip tone="rose" label="48g P left" />
              <MockChip tone="amber" label="92g C left" />
              <MockChip tone="emerald" label="18g F left" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MockChip({
  tone,
  label,
}: {
  tone: 'rose' | 'amber' | 'emerald'
  label: string
}) {
  const cls =
    tone === 'rose'
      ? 'bg-rose-50 text-rose-700 border-rose-100'
      : tone === 'amber'
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-emerald-50 text-emerald-700 border-emerald-100'
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${cls}`}
    >
      {label}
    </span>
  )
}
