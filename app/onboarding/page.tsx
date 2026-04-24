'use client'

import { useState, useMemo } from 'react'
import { saveOnboarding } from './actions'
import {
  calculateMacros,
  ACTIVITY_LABELS,
  GOAL_LABELS,
  type Sex,
  type ActivityLevel,
  type Goal,
} from '@/lib/nutrition/calculator'

export default function OnboardingPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // Controlled state for live macro preview
  const [age, setAge] = useState('')
  const [sex, setSex] = useState<Sex | ''>('')
  const [height, setHeight] = useState('')
  const [weight, setWeight] = useState('')
  const [activity, setActivity] = useState<ActivityLevel | ''>('')
  const [goal, setGoal] = useState<Goal | ''>('')

  // Compute live macro preview when all fields are filled
  const preview = useMemo(() => {
    const ageNum = parseInt(age, 10)
    const heightNum = parseFloat(height)
    const weightNum = parseFloat(weight)
    if (
      !ageNum || !sex || !heightNum || !weightNum || !activity || !goal ||
      ageNum < 13 || heightNum < 100 || weightNum < 30
    ) {
      return null
    }
    return calculateMacros({
      age: ageNum,
      sex: sex as Sex,
      height_cm: heightNum,
      weight_kg: weightNum,
      activity_level: activity as ActivityLevel,
      goal: goal as Goal,
    })
  }, [age, sex, height, weight, activity, goal])

  async function handleSubmit(formData: FormData) {
    setLoading(true)
    setError(null)
    const result = await saveOnboarding(formData)
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 via-amber-400 to-rose-400 shadow-md mb-3 text-2xl">
            🥗
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Welcome to NutriLens AI</h1>
          <p className="text-gray-600 mt-2">
            Let&apos;s set up your personalized nutrition targets. Takes about 30 seconds.
          </p>
        </div>

        <form action={handleSubmit} className="bg-white/75 backdrop-blur-md rounded-3xl shadow-lg border border-white p-6 sm:p-8 space-y-6">
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
              className="w-full px-3 py-2 border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent"
              placeholder="e.g., Archit"
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
                placeholder="25"
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
                <option value="">Select...</option>
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
                placeholder="175"
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
                placeholder="70"
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
              <option value="">Select...</option>
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

          {/* Live preview */}
          {preview && (
            <div className="bg-gradient-to-br from-orange-50 via-amber-50 to-rose-50 border border-orange-100 rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-2">
                Your daily targets
              </p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{preview.calories}</div>
                  <div className="text-xs text-orange-700">kcal</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{preview.protein_g}g</div>
                  <div className="text-xs text-rose-700">protein</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{preview.carbs_g}g</div>
                  <div className="text-xs text-amber-700">carbs</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-gray-900 tabular-nums">{preview.fat_g}g</div>
                  <div className="text-xs text-emerald-700">fat</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-orange-500 to-rose-500 text-white py-3 px-4 rounded-full font-medium shadow-md hover:shadow-lg disabled:opacity-50 transition"
          >
            {loading ? 'Saving...' : 'Save and continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
