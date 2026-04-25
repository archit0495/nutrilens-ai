'use client'

import { useEffect, useRef, useState } from 'react'
import {
  STREAK_MILESTONE_COPY,
  currentMilestone,
} from '@/lib/streak'

/**
 * Client-side streak celebrations — confetti + toast.
 *
 * Sits invisibly in the top nav. When `streak` changes (e.g. the user just
 * logged a meal that bumped them over a milestone), it checks localStorage
 * to see if we've already celebrated at this tier. If not, it pops a
 * milestone toast and emits a burst of canvas-free confetti. A separate
 * check tracks the user's personal best — when today's streak exceeds the
 * stored best, a "new personal best" toast pops instead of (or in addition
 * to) the milestone one.
 *
 * Everything is scoped to the user's device. Hackathon-pragmatic: no DB
 * writes, no cross-device sync. If a user opens the app on a new device
 * with a 30-day streak, they'll get their milestones re-celebrated there —
 * which is arguably the right call anyway (the moment is local).
 */

const STORAGE_KEY_MILESTONES = 'nutrilens.streak.celebrated'
const STORAGE_KEY_BEST = 'nutrilens.streak.personalBest'

// How long each toast sticks around, in ms.
const TOAST_MS = 4500

type Toast = {
  id: number
  kind: 'milestone' | 'best'
  title: string
  body: string
}

export default function StreakCelebrate({ streak }: { streak: number }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const [bursts, setBursts] = useState<number[]>([])
  // Increment to give each toast/burst a stable unique key even if the same
  // milestone fires twice within a session (shouldn't happen, but defensive).
  const counter = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (streak <= 0) return

    // Respect reduced-motion: skip confetti entirely, but still show the
    // toast so the user learns about the milestone.
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches

    // ------------------------------------------------------------------
    // Milestone check — only celebrate each tier once per device.
    // ------------------------------------------------------------------
    const milestone = currentMilestone(streak)
    let firedToast = false
    if (milestone !== null) {
      const celebrated = readSet(STORAGE_KEY_MILESTONES)
      if (!celebrated.has(milestone)) {
        celebrated.add(milestone)
        writeSet(STORAGE_KEY_MILESTONES, celebrated)

        const id = ++counter.current
        const body =
          STREAK_MILESTONE_COPY[milestone] ??
          `${milestone} days in a row. Keep going.`
        setToasts((prev) => [
          ...prev,
          {
            id,
            kind: 'milestone',
            title: `${milestone}-day streak!`,
            body,
          },
        ])
        if (!reducedMotion) setBursts((prev) => [...prev, id])
        firedToast = true

        scheduleToastDismiss(id, setToasts, setBursts)
      }
    }

    // ------------------------------------------------------------------
    // Personal best — fires when today's streak strictly exceeds what we
    // last recorded. We deliberately don't fire it on the same day a
    // milestone fires to avoid double-popping — the milestone copy
    // already conveys "this is a big deal."
    // ------------------------------------------------------------------
    const best = readNumber(STORAGE_KEY_BEST)
    if (streak > best) {
      writeNumber(STORAGE_KEY_BEST, streak)
      // Only pop the PB toast if we didn't just pop a milestone AND this
      // isn't the very first tracked streak (best was 0) — otherwise every
      // first logged day would PB-toast, which gets old fast.
      if (!firedToast && best > 0) {
        const id = ++counter.current
        setToasts((prev) => [
          ...prev,
          {
            id,
            kind: 'best',
            title: 'New personal best',
            body: `${streak} days and counting — longest streak yet.`,
          },
        ])
        scheduleToastDismiss(id, setToasts, setBursts)
      }
    }
    // We intentionally only depend on `streak`. `setToasts`/`setBursts` are
    // stable, and we don't want to re-run when the lists change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streak])

  return (
    <>
      {/* Confetti bursts — one absolute-positioned layer per triggered    */}
      {/* milestone. Removed once the confetti finishes animating.         */}
      {bursts.map((id) => (
        <ConfettiBurst key={`c-${id}`} />
      ))}

      {/* Toast stack — bottom-right so it doesn't fight the floating chat */}
      {/* widget, and doesn't obscure the streak chip the user just hit.   */}
      {toasts.length > 0 && (
        <div
          className="fixed z-50 bottom-24 right-6 sm:right-8 flex flex-col gap-2 pointer-events-none"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className="streak-toast pointer-events-auto max-w-xs rounded-2xl border bg-white/95 backdrop-blur-md shadow-lg shadow-orange-900/10 px-4 py-3 border-orange-200/70"
              role="status"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 text-white text-sm shadow-sm"
                >
                  {t.kind === 'best' ? '🏆' : '🔥'}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {t.title}
                  </p>
                  <p className="text-xs text-gray-700 mt-0.5 leading-snug">
                    {t.body}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Confetti — no canvas, no library. 40 absolutely-positioned tiny divs each
// launched at a random angle with a quick CSS transform animation. Gets
// cleaned up after ~1.2s so the DOM doesn't accumulate bits.
// ---------------------------------------------------------------------------

const CONFETTI_COUNT = 44
const CONFETTI_MS = 1200

type ConfettiPiece = {
  size: number
  duration: number
  delay: number
  hue: string
  tx: number
  ty: number
  spin: number
}

// Pre-compute each piece's trajectory once at mount via the `useState`
// initializer so the impure RNG calls happen during state init, never during
// render (lint rule react-hooks/purity).
function buildPieces(): ConfettiPiece[] {
  return Array.from({ length: CONFETTI_COUNT }, (_, i) => {
    const angle = (i / CONFETTI_COUNT) * 360 + rand(-8, 8)
    const distance = 140 + rand(-40, 80)
    const drift = rand(-30, 30)
    const spin = rand(180, 720) * (Math.random() < 0.5 ? -1 : 1)
    const duration = CONFETTI_MS + rand(-150, 150)
    const delay = rand(0, 80)
    const size = rand(6, 10)
    const hue = CONFETTI_HUES[i % CONFETTI_HUES.length]
    const tx = Math.cos((angle * Math.PI) / 180) * distance + drift
    const ty = Math.sin((angle * Math.PI) / 180) * distance + 180 // + gravity
    return { size, duration, delay, hue, tx, ty, spin }
  })
}

// Tailwind/CSS won't let us fluidly compose 40 unique random angles, so we
// generate them inline and let each piece inherit its own trajectory via
// custom properties.
function ConfettiBurst() {
  const [pieces] = useState<ConfettiPiece[]>(buildPieces)

  return (
    <div
      aria-hidden
      className="fixed inset-0 pointer-events-none z-[60] overflow-hidden"
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            // Launch from the top-right corner so the confetti visually
            // "comes from" the streak chip. 78% right / 10% from top maps
            // roughly to where the chip sits across viewport widths.
            left: '78%',
            top: '10%',
            width: `${p.size}px`,
            height: `${p.size * 0.55}px`,
            background: p.hue,
            animationDuration: `${p.duration}ms`,
            animationDelay: `${p.delay}ms`,
            ['--tx' as string]: `${p.tx}px`,
            ['--ty' as string]: `${p.ty}px`,
            ['--spin' as string]: `${p.spin}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  )
}

// Warm palette tuned to match the rest of the app.
const CONFETTI_HUES = [
  '#fb923c', // orange-400
  '#f97316', // orange-500
  '#f59e0b', // amber-500
  '#facc15', // yellow-400
  '#f43f5e', // rose-500
  '#fb7185', // rose-400
  '#10b981', // emerald-500
]

// ---------------------------------------------------------------------------
// LocalStorage helpers — defensive: crashing on a stored string that some
// extension has corrupted should never break the rest of the app.
// ---------------------------------------------------------------------------

function readSet(key: string): Set<number> {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return new Set()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((n) => typeof n === 'number'))
  } catch {
    return new Set()
  }
}

function writeSet(key: string, set: Set<number>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]))
  } catch {
    /* quota full or disabled — silent; next attempt will try again. */
  }
}

function readNumber(key: string): number {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return 0
    const n = Number(raw)
    return Number.isFinite(n) && n >= 0 ? n : 0
  } catch {
    return 0
  }
}

function writeNumber(key: string, n: number) {
  try {
    window.localStorage.setItem(key, String(n))
  } catch {
    /* same — silent fail on storage errors */
  }
}

function scheduleToastDismiss(
  id: number,
  setToasts: React.Dispatch<React.SetStateAction<Toast[]>>,
  setBursts: React.Dispatch<React.SetStateAction<number[]>>
) {
  window.setTimeout(() => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, TOAST_MS)
  // Bursts clean up a bit sooner — once the CSS anim ends the pieces are
  // invisible, no reason to keep the DOM nodes around.
  window.setTimeout(() => {
    setBursts((prev) => prev.filter((b) => b !== id))
  }, CONFETTI_MS + 200)
}

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min
}
