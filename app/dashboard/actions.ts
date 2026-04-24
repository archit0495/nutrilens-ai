'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const BUCKET = 'meal-photos'

export type MealPatch = {
  meal_name?: string
  description?: string | null
  calories?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
}

export type MutateMealResult = { ok: true } | { ok: false; error: string }

/**
 * Update a meal's editable fields. RLS on the meals table already scopes
 * update/delete to auth.uid() = user_id, so we don't need an explicit user
 * filter — but we still set one as defense-in-depth.
 */
export async function updateMeal(id: string, patch: MealPatch): Promise<MutateMealResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be logged in.' }

  // Sanitize — reject garbage numbers so we don't corrupt the dashboard totals.
  const sanitized: MealPatch = {}
  if (typeof patch.meal_name === 'string') {
    const trimmed = patch.meal_name.trim()
    if (!trimmed) return { ok: false, error: 'Meal name cannot be empty.' }
    if (trimmed.length > 200) return { ok: false, error: 'Meal name is too long.' }
    sanitized.meal_name = trimmed
  }
  if (typeof patch.description === 'string' || patch.description === null) {
    sanitized.description = patch.description
      ? patch.description.trim().slice(0, 1000)
      : null
  }
  for (const field of ['calories', 'protein_g', 'carbs_g', 'fat_g'] as const) {
    const v = patch[field]
    if (v === undefined) continue
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 10000) {
      return { ok: false, error: `Invalid ${field}: must be a number between 0 and 10000.` }
    }
    sanitized[field] = Math.round(v * 10) / 10 // 1 decimal place
  }

  const { error } = await supabase
    .from('meals')
    .update(sanitized)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true }
}

/**
 * Delete a meal and its backing storage blob (if any).
 * Storage cleanup is best-effort — if it fails we still report success on the
 * row deletion, since the user's intent (remove from totals) is fulfilled.
 */
export async function deleteMeal(id: string): Promise<MutateMealResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be logged in.' }

  // Fetch the image_url first so we know what (if anything) to clean up.
  // .select().single() is safe because of RLS — users can't read other rows.
  const { data: meal, error: fetchError } = await supabase
    .from('meals')
    .select('image_url')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !meal) {
    return { ok: false, error: fetchError?.message ?? 'Meal not found.' }
  }

  const { error: deleteError } = await supabase
    .from('meals')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (deleteError) return { ok: false, error: deleteError.message }

  // Best-effort storage cleanup. Public URL looks like:
  //   https://<project>.supabase.co/storage/v1/object/public/meal-photos/<userId>/<ts>.<ext>
  // We only need the path AFTER the bucket name.
  if (meal.image_url) {
    const marker = `/${BUCKET}/`
    const idx = meal.image_url.indexOf(marker)
    if (idx !== -1) {
      const storagePath = meal.image_url.slice(idx + marker.length)
      // Fire-and-forget: don't fail the action if storage removal fails.
      await supabase.storage.from(BUCKET).remove([storagePath])
    }
  }

  revalidatePath('/dashboard')
  return { ok: true }
}
