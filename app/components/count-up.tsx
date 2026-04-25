'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * A number that tweens from 0 → `value` on mount (or whenever `value`
 * changes). Uses `requestAnimationFrame` and an ease-out-cubic curve.
 *
 * Why a client component?
 *   The dashboard renders on the server with the final numeric value,
 *   and we want the _visual_ to ramp up once the user sees it. Seeding
 *   the initial state with `value` would flash the final number before
 *   the ramp starts, so we seed with 0 and race through the tween.
 *
 * Respects prefers-reduced-motion — skips the animation entirely.
 */
export default function CountUp({
  value,
  duration = 900,
  className,
  prefix = '',
  suffix = '',
  locale = true,
}: {
  value: number
  duration?: number
  className?: string
  prefix?: string
  suffix?: string
  /** When true, format the rendered number with `toLocaleString()`. */
  locale?: boolean
}) {
  const [display, setDisplay] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // Respect the user's motion preference.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (prefersReduced || duration <= 0) {
      // Defer past the effect body so we're not running a synchronous
      // setState during the effect (lint rule react-hooks/set-state-in-effect).
      rafRef.current = requestAnimationFrame(() => setDisplay(value))
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
      }
    }

    const start = performance.now()
    const from = 0
    const to = value

    const tick = (t: number) => {
      const elapsed = t - start
      const progress = Math.min(1, elapsed / duration)
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = from + (to - from) * eased
      setDisplay(next)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      }
    }
    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    }
  }, [value, duration])

  const rounded = Math.round(display)
  const body = locale ? rounded.toLocaleString() : String(rounded)
  return <span className={className}>{prefix}{body}{suffix}</span>
}
