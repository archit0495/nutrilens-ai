'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Writes the browser's IANA timezone to a cookie (`nl_tz`) so server
 * components can compute "today" in the user's local time instead of UTC.
 *
 * - Only writes the cookie if it's missing or stale (different tz string).
 * - When the cookie changes, calls `router.refresh()` so already-rendered
 *   server components re-fetch and re-render with the right tz. On a fresh
 *   first visit this is the only render that "looks UTC"; everything after
 *   uses the cached cookie.
 *
 * Mounted once in the root layout, so every authed and anon page gets the
 * sync without each page wiring it up.
 */
export default function TimezoneSync() {
  const router = useRouter()

  useEffect(() => {
    let tz = 'UTC'
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    } catch {
      tz = 'UTC'
    }

    const current = document.cookie
      .split('; ')
      .find((c) => c.startsWith('nl_tz='))
      ?.slice('nl_tz='.length)

    const decoded = current ? decodeURIComponent(current) : null
    if (decoded === tz) return

    // 1 year, lax — same defaults as the Supabase auth cookies.
    document.cookie = `nl_tz=${encodeURIComponent(tz)}; path=/; max-age=${
      60 * 60 * 24 * 365
    }; SameSite=Lax`
    router.refresh()
  }, [router])

  return null
}
