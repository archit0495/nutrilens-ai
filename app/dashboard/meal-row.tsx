'use client'

import { useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { updateMeal, deleteMeal } from './actions'

// useSyncExternalStore wants a stable subscribe function. We never need to
// notify React of changes — the time string only depends on `iso` — so a
// no-op unsubscribe is fine.
const subscribeToNothing = () => () => {}

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

export default function MealRow({ meal, index = 0 }: { meal: Meal; index?: number }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)

  // The server has no idea what timezone the user is in, so we feed
  // useSyncExternalStore a deterministic UTC `HH:MM` server snapshot and a
  // locale-formatted client snapshot. React swaps from server → client
  // automatically on mount — no setState-in-effect (lint rule
  // react-hooks/set-state-in-effect).
  const timeStr = useSyncExternalStore(
    subscribeToNothing,
    () =>
      new Date(meal.logged_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    () => {
      const d = new Date(meal.logged_at)
      const hh = String(d.getUTCHours()).padStart(2, '0')
      const mm = String(d.getUTCMinutes()).padStart(2, '0')
      return `${hh}:${mm}`
    }
  )

  const detailHref = `/meals/${meal.id}`

  return (
    <li
      className="rounded-2xl bg-white border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden anim-fade-up"
      style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}
    >
      <div className="flex items-start gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Photo doubles as a link to the detail page. Kept as its own Link
            so clicking Edit (inside the text column) doesn't navigate. */}
        <Link
          href={detailHref}
          aria-label={`View details for ${meal.meal_name ?? 'meal'}`}
          className="flex-shrink-0 group/photo"
        >
          {meal.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={meal.image_url}
              alt={meal.meal_name ?? 'Meal'}
              className="w-20 h-20 rounded-xl object-cover border border-gray-100 transition-transform group-hover/photo:scale-[1.03] group-hover/photo:shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-gradient-to-br from-orange-100 to-amber-100 border border-gray-100 flex items-center justify-center text-3xl transition-transform group-hover/photo:scale-[1.03]">
              🍽️
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            {/* Meal name links to the detail page. */}
            <Link
              href={detailHref}
              className="flex-1 min-w-0 group/name"
            >
              <h3 className="font-semibold text-gray-900 text-sm sm:text-base leading-snug truncate group-hover/name:text-orange-700 transition-colors">
                {meal.meal_name ?? 'Untitled meal'}
              </h3>
            </Link>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[11px] text-gray-400 tabular-nums">{timeStr}</span>
              {!editing && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="text-xs font-medium text-orange-600 hover:text-orange-700"
                >
                  Edit
                </button>
              )}
              <Link
                href={detailHref}
                aria-label="View meal details"
                className="text-gray-300 hover:text-gray-600 transition-colors"
              >
                <svg
                  className="w-4 h-4"
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
              </Link>
            </div>
          </div>
          {meal.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{meal.description}</p>
          )}

          {/* Macro chips */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            <MacroChip
              value={meal.calories ?? 0}
              unit="kcal"
              tone="calories"
            />
            <MacroChip
              value={Math.round(Number(meal.protein_g ?? 0))}
              unit="g P"
              tone="protein"
            />
            <MacroChip
              value={Math.round(Number(meal.carbs_g ?? 0))}
              unit="g C"
              tone="carbs"
            />
            <MacroChip
              value={Math.round(Number(meal.fat_g ?? 0))}
              unit="g F"
              tone="fat"
            />
          </div>
        </div>
      </div>

      {editing && (
        <MealEditor
          meal={meal}
          onClose={() => setEditing(false)}
          onChanged={() => router.refresh()}
        />
      )}
    </li>
  )
}

// ---------------------------------------------------------------------------
// Macro chip — colored pill for a single macro value
// ---------------------------------------------------------------------------

type ChipTone = 'calories' | 'protein' | 'carbs' | 'fat'

const CHIP_STYLES: Record<ChipTone, string> = {
  calories: 'bg-orange-50 text-orange-700 border-orange-100',
  protein: 'bg-rose-50 text-rose-700 border-rose-100',
  carbs: 'bg-amber-50 text-amber-700 border-amber-100',
  fat: 'bg-emerald-50 text-emerald-700 border-emerald-100',
}

function MacroChip({
  value,
  unit,
  tone,
}: {
  value: number
  unit: string
  tone: ChipTone
}) {
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${CHIP_STYLES[tone]}`}
    >
      <span className="font-bold tabular-nums">{value}</span>
      <span className="opacity-70">{unit}</span>
    </span>
  )
}

// ---------------------------------------------------------------------------
// Inline editor
// ---------------------------------------------------------------------------

function MealEditor({
  meal,
  onClose,
  onChanged,
}: {
  meal: Meal
  onClose: () => void
  onChanged: () => void
}) {
  const [mealName, setMealName] = useState(meal.meal_name ?? '')
  const [calories, setCalories] = useState(String(meal.calories ?? 0))
  const [protein, setProtein] = useState(String(Math.round(Number(meal.protein_g ?? 0))))
  const [carbs, setCarbs] = useState(String(Math.round(Number(meal.carbs_g ?? 0))))
  const [fat, setFat] = useState(String(Math.round(Number(meal.fat_g ?? 0))))

  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const result = await updateMeal(meal.id, {
        meal_name: mealName,
        calories: parseFloat(calories) || 0,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onChanged()
      onClose()
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const result = await deleteMeal(meal.id)
      if (!result.ok) {
        setError(result.error)
        setConfirmingDelete(false)
        return
      }
      onChanged()
      // Row unmounts on next render — no need to call onClose.
    })
  }

  return (
    <div className="border-t border-gray-100 bg-gradient-to-br from-orange-50/50 to-amber-50/50 p-4 space-y-3">
      {/* Meal name */}
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
          Meal
        </label>
        <input
          type="text"
          value={mealName}
          onChange={(e) => setMealName(e.target.value)}
          className="w-full px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
        />
      </div>

      {/* Macros grid */}
      <div className="grid grid-cols-4 gap-2">
        <MacroInput label="kcal" value={calories} onChange={setCalories} />
        <MacroInput label="g P" value={protein} onChange={setProtein} />
        <MacroInput label="g C" value={carbs} onChange={setCarbs} />
        <MacroInput label="g F" value={fat} onChange={setFat} />
      </div>

      {error && (
        <p className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-1">
        {confirmingDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-700">Delete this meal?</span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 disabled:opacity-50 shadow-sm"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              disabled={isPending}
              className="text-xs font-medium px-2 py-1 text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            disabled={isPending}
            className="text-xs font-medium text-rose-600 hover:text-rose-700"
          >
            Delete
          </button>
        )}

        {!confirmingDelete && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="text-xs font-medium px-3 py-1.5 border border-gray-200 rounded-full text-gray-700 hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="text-xs font-medium px-4 py-1.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-full hover:shadow-md disabled:opacity-50 shadow-sm transition-shadow"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function MacroInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <input
        type="number"
        inputMode="decimal"
        min={0}
        max={10000}
        step="any"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-center tabular-nums"
      />
      <div className="text-[10px] text-gray-500 text-center mt-1 uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  )
}
