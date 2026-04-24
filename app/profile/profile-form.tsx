'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateProfile } from './actions'
import {
  calculateMacros,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type ActivityLevel,
  type Goal,
  type MacroTargets,
  type Sex,
} from '@/lib/nutrition/calculator'

type InitialValues = {
  full_name: string
  age: number
  sex: Sex
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
  goal: Goal
}

export default function ProfileForm({
  initial,
  currentTargets,
}: {
  initial: InitialValues
  currentTargets: MacroTargets
}) {
  const router = useRouter()

  // Controlled state — strings so we can keep empty inputs while typing.
  const [fullName, setFullName] = useState(initial.full_name)
  const [age, setAge] = useState(String(initial.age))
  const [sex, setSex] = useState<Sex>(initial.sex)
  const [height, setHeight] = useState(String(initial.height_cm))
  const [weight, setWeight] = useState(String(initial.weight_kg))
  const [activity, setActivity] = useState<ActivityLevel>(initial.activity_level)
  const [goal, setGoal] = useState<Goal>(initial.goal)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<MacroTargets | null>(null)

  // Live preview — recomputes whenever any input changes. Same calculator the
  // server will use, so "what you see is what gets saved".
  const preview = useMemo(() => {
    const ageNum = parseInt(age, 10)
    const heightNum = parseFloat(height)
    const weightNum = parseFloat(weight)
    if (
      !ageNum || !heightNum || !weightNum ||
      ageNum < 13 || heightNum < 100 || weightNum < 30
    ) {
      return null
    }
    return calculateMacros({
      age: ageNum,
      sex,
      height_cm: heightNum,
      weight_kg: weightNum,
      activity_level: activity,
      goal,
    })
  }, [age, sex, height, weight, activity, goal])

  // Detect drift from the saved targets so we can highlight the "new plan".
  const hasChanges = preview
    ? preview.calories !== currentTargets.calories ||
      preview.protein_g !== currentTargets.protein_g ||
      preview.carbs_g !== currentTargets.carbs_g ||
      preview.fat_g !== currentTargets.fat_g
    : false

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSaved(null)
    const formData = new FormData(e.currentTarget)
    const result = await updateProfile(formData)
    setLoading(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaved(result.macros)
    // Server action revalidated /dashboard — refresh local router cache too.
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white/75 backdrop-blur-md rounded-3xl shadow-lg border border-white p-6 sm:p-8 space-y-6">
      {/* Name */}
      <div>
        <label htmlFor="full_name" className="block text-sm font-medium text-gray-700 mb-1">
          Your name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
        />
      </div>

      {/* Age + Sex */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">
            Age
          </label>
          <input
            id="age"
            name="age"
            type="number"
            min={13}
            max={120}
            required
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="sex" className="block text-sm font-medium text-gray-700 mb-1">
            Sex
          </label>
          <select
            id="sex"
            name="sex"
            required
            value={sex}
            onChange={(e) => setSex(e.target.value as Sex)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
          </select>
        </div>
      </div>

      {/* Height + Weight */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="height_cm" className="block text-sm font-medium text-gray-700 mb-1">
            Height (cm)
          </label>
          <input
            id="height_cm"
            name="height_cm"
            type="number"
            step="0.1"
            min={100}
            max={250}
            required
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>
        <div>
          <label htmlFor="weight_kg" className="block text-sm font-medium text-gray-700 mb-1">
            Weight (kg)
          </label>
          <input
            id="weight_kg"
            name="weight_kg"
            type="number"
            step="0.1"
            min={30}
            max={300}
            required
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
          />
        </div>
      </div>

      {/* Activity level */}
      <div>
        <label htmlFor="activity_level" className="block text-sm font-medium text-gray-700 mb-1">
          Activity level
        </label>
        <select
          id="activity_level"
          name="activity_level"
          required
          value={activity}
          onChange={(e) => setActivity(e.target.value as ActivityLevel)}
          className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent bg-white"
        >
          {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      {/* Goal */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          What&apos;s your goal?
        </label>
        <div className="grid grid-cols-3 gap-3">
          {(Object.entries(GOAL_LABELS) as [Goal, string][]).map(([value, label]) => (
            <label
              key={value}
              className={`flex items-center justify-center p-3 border rounded-2xl cursor-pointer text-sm font-medium transition ${
                goal === value
                  ? 'border-orange-400 bg-orange-50 text-orange-700 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-orange-200 text-gray-700'
              }`}
            >
              <input
                type="radio"
                name="goal"
                value={value}
                checked={goal === value}
                onChange={(e) => setGoal(e.target.value as Goal)}
                className="sr-only"
                required
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      {/* Live preview — shows the plan the server WOULD save right now */}
      {preview && (
        <div
          className={`border rounded-2xl p-4 shadow-sm transition ${
            hasChanges
              ? 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200'
              : 'bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 border-orange-100'
          }`}
        >
          <div className="flex items-baseline justify-between mb-2">
            <p
              className={`text-xs font-semibold uppercase tracking-wider ${
                hasChanges ? 'text-amber-700' : 'text-orange-700'
              }`}
            >
              {hasChanges ? 'New plan preview' : 'Your daily targets'}
            </p>
            {hasChanges && (
              <p className="text-xs font-medium text-amber-700 tabular-nums">
                Δ{' '}
                {signed(preview.calories - currentTargets.calories)} kcal ·{' '}
                {signed(preview.protein_g - currentTargets.protein_g)}g P ·{' '}
                {signed(preview.carbs_g - currentTargets.carbs_g)}g C ·{' '}
                {signed(preview.fat_g - currentTargets.fat_g)}g F
              </p>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 text-center">
            <PreviewCell value={preview.calories} label="kcal" tone="calories" />
            <PreviewCell value={`${preview.protein_g}g`} label="protein" tone="protein" />
            <PreviewCell value={`${preview.carbs_g}g`} label="carbs" tone="carbs" />
            <PreviewCell value={`${preview.fat_g}g`} label="fat" tone="fat" />
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      {saved && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-sm text-emerald-800">
          ✅ Profile updated. New targets: {saved.calories} kcal · {saved.protein_g}g P ·{' '}
          {saved.carbs_g}g C · {saved.fat_g}g F
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.push('/dashboard')}
          className="flex-1 py-2.5 px-4 border border-gray-200 rounded-full bg-white text-sm font-medium text-gray-700 hover:bg-white/80"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 bg-gradient-to-r from-orange-500 to-rose-500 text-white py-2.5 px-4 rounded-full font-medium shadow-md hover:shadow-lg disabled:opacity-50 transition"
        >
          {loading ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </form>
  )
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n)
}

function PreviewCell({
  value,
  label,
  tone,
}: {
  value: number | string
  label: string
  tone: 'calories' | 'protein' | 'carbs' | 'fat'
}) {
  const labelColors: Record<typeof tone, string> = {
    calories: 'text-orange-700',
    protein: 'text-rose-700',
    carbs: 'text-amber-700',
    fat: 'text-emerald-700',
  }
  return (
    <div>
      <div className="text-2xl font-bold text-gray-900 tabular-nums">{value}</div>
      <div className={`text-xs ${labelColors[tone]}`}>{label}</div>
    </div>
  )
}
