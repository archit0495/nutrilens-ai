'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { logout } from '../login/actions'
import StreakCelebrate from './streak-celebrate'

/**
 * Top navigation bar.
 *
 * Rendered in the root layout (via the server-side `TopNavContainer` which
 * fetches the streak) so it lives above every page. It hides itself on the
 * auth/onboarding flows where a full-chrome nav would be noisy and the user
 * isn't meant to jump around.
 *
 * `streak` is optional:
 *   - `null`  → no user or no streak data; we render without the fire chip
 *   - `0`     → user is logged in but hasn't logged anything today or
 *               yesterday; we hide the chip to avoid shaming
 *   - `>0`    → chip appears, clickable to /history, with a quiet celebration
 *               pop on milestones (handled by the separate client component
 *               so it can manage its own localStorage/confetti state).
 */
export default function TopNav({ streak }: { streak: number | null }) {
  const pathname = usePathname() ?? ''

  // Hide on login/onboarding/landing so those flows stay focused.
  if (pathname === '/login' || pathname === '/onboarding' || pathname === '/') {
    return null
  }

  const links: { href: string; label: string }[] = [
    { href: '/dashboard', label: 'Today' },
    { href: '/history', label: 'History' },
    { href: '/profile', label: 'Profile' },
  ]

  const showStreak = streak !== null && streak > 0

  return (
    <header className="sticky top-0 z-40 bg-white/70 backdrop-blur-md border-b border-white/60 shadow-[0_1px_0_rgba(251,146,60,0.08)]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-2">
        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 group shrink-0"
          aria-label="NutriLens AI — home"
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 text-base shadow-sm group-hover:shadow-md transition-shadow">
            🥗
          </span>
          <span className="font-bold text-gray-900 hidden sm:inline">
            NutriLens
          </span>
        </Link>

        {/* Links */}
        <nav className="flex items-center gap-0.5 sm:gap-1">
          {links.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-orange-700 bg-orange-50'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                {link.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-1 h-1 rounded-full bg-gradient-to-r from-orange-500 to-rose-500"
                  />
                )}
              </Link>
            )
          })}
        </nav>

        {/* Streak chip + sign-out. Streak chip is a Link to /history since */}
        {/* the weekly coach there gives the streak its natural context.    */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {showStreak && <StreakChip streak={streak as number} />}

          <form action={logout} className="hidden sm:block">
            <button
              type="submit"
              className="px-3 py-1.5 text-sm font-medium rounded-full text-gray-600 hover:text-gray-900 hover:bg-white/60 transition-colors"
            >
              Sign out
            </button>
          </form>

          {/* Mobile sign-out — just an icon to save space */}
          <form action={logout} className="sm:hidden">
            <button
              type="submit"
              aria-label="Sign out"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-600 hover:text-gray-900 hover:bg-white/60 transition-colors"
            >
              {/* arrow-right-on-rectangle (logout) */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                  clipRule="evenodd"
                />
                <path
                  fillRule="evenodd"
                  d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </form>
        </div>
      </div>

      {/* Celebration / PB toast logic — invisible until it fires. It reads */}
      {/* the streak, diffs against localStorage, and pops confetti + a    */}
      {/* toast exactly once per milestone or personal best.               */}
      {streak !== null && streak > 0 && <StreakCelebrate streak={streak} />}
    </header>
  )
}

/**
 * The fire chip itself. Pure presentational — wrapped in a Link so tapping it
 * takes the user to /history where the streak has the most context (Claude's
 * weekly read, the 14-day grid, etc.). Uses `tabular-nums` so the number
 * doesn't shimmy as the streak rolls from 9 → 10 → 100.
 */
function StreakChip({ streak }: { streak: number }) {
  return (
    <Link
      href="/history"
      aria-label={`Logging streak: ${streak} day${streak === 1 ? '' : 's'}`}
      title={`${streak}-day streak — tap to see your history`}
      className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-sm font-semibold bg-gradient-to-br from-orange-100 to-rose-100 text-orange-800 border border-orange-200/70 hover:from-orange-200 hover:to-rose-200 transition shadow-sm"
    >
      <span aria-hidden className="text-sm leading-none">
        🔥
      </span>
      <span className="tabular-nums">{streak}</span>
    </Link>
  )
}
