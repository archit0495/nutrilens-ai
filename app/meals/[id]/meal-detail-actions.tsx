'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateMeal, deleteMeal } from '@/app/dashboard/actions'

type EditableMeal = {
  id: string
  meal_name: string
  description: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/**
 * Edit + delete controls for the meal detail page.
 *
 * Re-uses the same `updateMeal` / `deleteMeal` server actions as the dashboard
 * meal rows, but with a larger, full-width form layout that's appropriate for
 * a dedicated page. On delete, we navigate back to the dashboard (with the
 * day query param, if the caller passes one through) so the user lands
 * somewhere meaningful instead of a 404.
 */
export default function MealDetailActions({ meal }: { meal: EditableMeal }) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState(meal.meal_name)
  const [description, setDescription] = useState(meal.description)
  const [calories, setCalories] = useState(String(meal.calories))
  const [protein, setProtein] = useState(String(meal.protein_g))
  const [carbs, setCarbs] = useState(String(meal.carbs_g))
  const [fat, setFat] = useState(String(meal.fat_g))

  function resetAndCancel() {
    setName(meal.meal_name)
    setDescription(meal.description)
    setCalories(String(meal.calories))
    setProtein(String(meal.protein_g))
    setCarbs(String(meal.carbs_g))
    setFat(String(meal.fat_g))
    setError(null)
    setEditing(false)
  }

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await updateMeal(meal.id, {
        meal_name: name,
        description: description || null,
        calories: parseFloat(calories) || 0,
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
      })
      if (!res.ok) {
        setError(res.error)
        return
      }
      setEditing(false)
      router.refresh()
    })
  }

  function handleDelete() {
    setError(null)
    startTransition(async () => {
      const res = await deleteMeal(meal.id)
      if (!res.ok) {
        setError(res.error)
        setConfirmDelete(false)
        return
      }
      // After delete, bounce to the dashboard — there's no row to come back to.
      router.replace('/dashboard')
    })
  }

  if (!editing) {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
        {error && (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-full px-3 py-1">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2 sm:ml-auto flex-wrap">
          {confirmDelete ? (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-gray-700">Delete this meal?</span>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="text-xs font-semibold px-4 py-1.5 bg-rose-600 text-white rounded-full hover:bg-rose-700 disabled:opacity-50 shadow-sm transition"
              >
                {isPending ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                disabled={isPending}
                className="text-xs font-medium px-3 py-1.5 text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-sm font-medium px-4 py-2 rounded-full text-rose-700 bg-white/60 border border-rose-100 hover:bg-white shadow-sm transition"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="text-sm font-semibold px-5 py-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md hover:shadow-lg transition"
              >
                Edit meal
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-gray-100 p-5 sm:p-6 space-y-4">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
          Meal name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          maxLength={200}
        />
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-widest text-gray-500 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
          maxLength={1000}
          placeholder="Optional description"
        />
      </div>

      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        <MacroInput label="kcal" value={calories} onChange={setCalories} />
        <MacroInput label="g P" value={protein} onChange={setProtein} />
        <MacroInput label="g C" value={carbs} onChange={setCarbs} />
        <MacroInput label="g F" value={fat} onChange={setFat} />
      </div>

      {error && (
        <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={resetAndCancel}
          disabled={isPending}
          className="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isPending}
          className="text-sm font-semibold px-5 py-2 rounded-full bg-gradient-to-r from-orange-500 to-rose-500 text-white shadow-md hover:shadow-lg disabled:opacity-50 transition"
        >
          {isPending ? 'Saving…' : 'Save changes'}
        </button>
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
        className="w-full px-2 py-2 text-base bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent text-center tabular-nums font-semibold"
      />
      <div className="text-[10px] text-gray-500 text-center mt-1 uppercase tracking-wider font-semibold">
        {label}
      </div>
    </div>
  )
}
