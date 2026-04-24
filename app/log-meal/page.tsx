'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { logMeal, type LogMealResult } from './actions'

export default function LogMealPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [mode, setMode] = useState<'photo' | 'text'>('photo')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Extract<LogMealResult, { ok: true }>['meal'] | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null)
    setResult(null)
    const file = e.target.files?.[0]
    if (!file) {
      setPreviewUrl(null)
      setFileName(null)
      return
    }
    setFileName(file.name)
    // Create an object URL for instant preview (no upload yet)
    const url = URL.createObjectURL(file)
    setPreviewUrl(url)
  }

  function switchMode(next: 'photo' | 'text') {
    setMode(next)
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const response = await logMeal(formData)

    setLoading(false)

    if (!response.ok) {
      setError(response.error)
      return
    }

    setResult(response.meal)
  }

  function reset() {
    setPreviewUrl(null)
    setFileName(null)
    setDescription('')
    setResult(null)
    setError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const canSubmit =
    mode === 'photo' ? Boolean(previewUrl) : description.trim().length > 0

  return (
    <div className="min-h-screen p-4 sm:p-8">
      <div className="max-w-2xl mx-auto anim-fade-up">
        {/* Page heading. Global chrome (logo, links, sign out) lives in <TopNav />. */}
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Log a meal</h1>
          <p className="text-sm text-gray-600 mt-1">
            Snap a photo or describe what you ate — Claude handles the rest.
          </p>
        </div>

        {/* Success state: show analysis result */}
        {result ? (
          <div className="bg-white/75 backdrop-blur-md rounded-3xl shadow-lg border border-white p-6 space-y-6">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-xl shadow-sm">
                ✅
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Meal logged</h2>
                <p className="text-sm text-gray-600 mt-0.5">
                  {result.meal_name}
                </p>
              </div>
            </div>

            {previewUrl && (
              <div className="rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Meal" className="w-full h-64 object-cover" />
              </div>
            )}

            <p className="text-sm text-gray-700">{result.description}</p>

            <div className="grid grid-cols-4 gap-2 text-center">
              <MacroPill label="kcal" value={result.calories} tone="calories" />
              <MacroPill label="protein" value={`${result.protein_g}g`} tone="protein" />
              <MacroPill label="carbs" value={`${result.carbs_g}g`} tone="carbs" />
              <MacroPill label="fat" value={`${result.fat_g}g`} tone="fat" />
            </div>

            <div className="flex items-center gap-2 text-xs">
              <ConfidenceBadge level={result.confidence} />
              {result.notes && (
                <span className="text-gray-500">{result.notes}</span>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={reset}
                className="flex-1 py-2.5 px-4 border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:bg-white"
              >
                Log another
              </button>
              <button
                onClick={() => router.push('/dashboard')}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-full text-sm font-medium shadow-md hover:shadow-lg transition"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        ) : (
          /* Upload form */
          <form
            onSubmit={handleSubmit}
            className="bg-white/75 backdrop-blur-md rounded-3xl shadow-lg border border-white p-6 space-y-5"
          >
            {/* Hidden mode input — read by the server action */}
            <input type="hidden" name="mode" value={mode} />

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-orange-50/70 rounded-full border border-orange-100">
              <button
                type="button"
                onClick={() => switchMode('photo')}
                className={`py-2 px-3 rounded-full text-sm font-medium transition ${
                  mode === 'photo'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📸 Photo
              </button>
              <button
                type="button"
                onClick={() => switchMode('text')}
                className={`py-2 px-3 rounded-full text-sm font-medium transition ${
                  mode === 'text'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                ✍️ Describe
              </button>
            </div>

            {mode === 'photo' ? (
              /* Photo picker */
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Meal photo
                </label>

                {previewUrl ? (
                  <div className="relative rounded-2xl overflow-hidden border border-gray-100 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="Preview" className="w-full h-64 object-cover" />
                    <button
                      type="button"
                      onClick={reset}
                      className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-700 rounded-full w-8 h-8 flex items-center justify-center text-lg shadow"
                      aria-label="Remove photo"
                    >
                      ×
                    </button>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                      {fileName}
                    </div>
                  </div>
                ) : (
                  <label
                    htmlFor="image"
                    className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-orange-200 bg-orange-50/40 rounded-2xl cursor-pointer hover:border-orange-400 hover:bg-orange-50/70 transition"
                  >
                    <div className="text-4xl mb-2">📸</div>
                    <p className="text-sm font-medium text-gray-700">Tap to take or pick a photo</p>
                    <p className="text-xs text-gray-500 mt-1">JPG, PNG, or WEBP · under 10MB</p>
                  </label>
                )}

                <input
                  ref={fileInputRef}
                  id="image"
                  name="image"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleFileChange}
                  className="sr-only"
                />
              </div>
            ) : (
              /* Text description */
              <div>
                <label
                  htmlFor="description"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  What did you eat?
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={6}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value)
                    setError(null)
                  }}
                  maxLength={2000}
                  placeholder={
                    'e.g., 2 scrambled eggs, 1 cup oatmeal with 1 tbsp peanut butter, 1 medium banana'
                  }
                  className="w-full rounded-2xl bg-white border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent resize-none"
                />
                <div className="flex justify-between items-center mt-1">
                  <p className="text-xs text-gray-500">
                    Include amounts (grams, cups, pieces) for best accuracy.
                  </p>
                  <span className="text-xs text-gray-400">{description.length}/2000</span>
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-sm text-rose-700">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full bg-gradient-to-r from-orange-500 to-rose-500 text-white py-3 px-4 rounded-full font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Spinner /> Analyzing your meal...
                </>
              ) : (
                'Analyze & log meal'
              )}
            </button>

            <p className="text-xs text-gray-500 text-center">
              Claude will identify the food and estimate macros automatically.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}

function MacroPill({
  label,
  value,
  tone,
}: {
  label: string
  value: number | string
  tone: 'calories' | 'protein' | 'carbs' | 'fat'
}) {
  const styles: Record<typeof tone, string> = {
    calories: 'bg-orange-50 border-orange-100 text-orange-900',
    protein: 'bg-rose-50 border-rose-100 text-rose-900',
    carbs: 'bg-amber-50 border-amber-100 text-amber-900',
    fat: 'bg-emerald-50 border-emerald-100 text-emerald-900',
  }
  return (
    <div className={`rounded-2xl border p-3 ${styles[tone]}`}>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  )
}

function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const styles = {
    low: 'bg-amber-100 text-amber-800',
    medium: 'bg-orange-100 text-orange-800',
    high: 'bg-emerald-100 text-emerald-800',
  }
  const labels = {
    low: 'Low confidence',
    medium: 'Medium confidence',
    high: 'High confidence',
  }
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[level]}`}>
      {labels[level]}
    </span>
  )
}
