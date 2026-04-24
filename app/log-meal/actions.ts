'use server'

import { createClient } from '@/lib/supabase/server'
import { analyzeMealPhoto, analyzeMealText, type MealAnalysis } from '@/lib/claude/vision'
import { revalidatePath } from 'next/cache'

const BUCKET = 'meal-photos'
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10MB
const MAX_DESCRIPTION_CHARS = 2000

export type LogMealResult =
  | { ok: true; meal: MealAnalysis & { id: string; image_url: string | null } }
  | { ok: false; error: string }

export async function logMeal(formData: FormData): Promise<LogMealResult> {
  const supabase = await createClient()

  // Auth check
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, error: 'You must be logged in to log meals.' }
  }

  const mode = formData.get('mode')
  if (mode === 'text') {
    return logMealText(formData, user.id, supabase)
  }
  // Default to photo mode (covers legacy form submissions without a mode field)
  return logMealPhoto(formData, user.id, supabase)
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function logMealPhoto(
  formData: FormData,
  userId: string,
  supabase: SupabaseClient
): Promise<LogMealResult> {
  // Validate the image
  const image = formData.get('image')
  if (!(image instanceof File) || image.size === 0) {
    return { ok: false, error: 'Please attach a meal photo.' }
  }
  if (image.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image is too large. Please use a photo under 10MB.' }
  }
  if (!image.type.startsWith('image/')) {
    return { ok: false, error: 'Please upload an image file (JPEG, PNG, or WEBP).' }
  }

  // Upload to Supabase Storage at {user_id}/{timestamp}.{ext}
  // Our RLS policy requires the first folder segment to equal auth.uid().
  const ext = (image.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
  const path = `${userId}/${Date.now()}.${ext || 'jpg'}`
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, image, { contentType: image.type, upsert: false })
  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path)

  // Ask Claude Vision to identify the food and estimate macros
  let analysis: MealAnalysis
  try {
    analysis = await analyzeMealPhoto(publicUrl)
  } catch (err) {
    // Roll back the upload so we don't leave orphan images
    await supabase.storage.from(BUCKET).remove([path])
    const message = err instanceof Error ? err.message : 'Vision analysis failed.'
    return { ok: false, error: `Couldn't analyze photo: ${message}` }
  }

  return insertMeal(supabase, userId, analysis, publicUrl, path)
}

async function logMealText(
  formData: FormData,
  userId: string,
  supabase: SupabaseClient
): Promise<LogMealResult> {
  const rawDescription = formData.get('description')
  const description = typeof rawDescription === 'string' ? rawDescription.trim() : ''

  if (!description) {
    return { ok: false, error: 'Please describe your meal.' }
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return { ok: false, error: `Description is too long (max ${MAX_DESCRIPTION_CHARS} characters).` }
  }

  let analysis: MealAnalysis
  try {
    analysis = await analyzeMealText(description)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Analysis failed.'
    return { ok: false, error: `Couldn't analyze meal: ${message}` }
  }

  return insertMeal(supabase, userId, analysis, null, null)
}

async function insertMeal(
  supabase: SupabaseClient,
  userId: string,
  analysis: MealAnalysis,
  imageUrl: string | null,
  storagePath: string | null
): Promise<LogMealResult> {
  const { data: inserted, error: insertError } = await supabase
    .from('meals')
    .insert({
      user_id: userId,
      image_url: imageUrl,
      meal_name: analysis.meal_name,
      description: analysis.description,
      calories: analysis.calories,
      protein_g: analysis.protein_g,
      carbs_g: analysis.carbs_g,
      fat_g: analysis.fat_g,
      ai_raw_response: analysis as unknown as Record<string, unknown>,
    })
    .select('id')
    .single()

  if (insertError || !inserted) {
    // Roll back uploaded image if the DB insert fails
    if (storagePath) {
      await supabase.storage.from(BUCKET).remove([storagePath])
    }
    return { ok: false, error: `Couldn't save meal: ${insertError?.message ?? 'unknown error'}` }
  }

  revalidatePath('/dashboard')

  return {
    ok: true,
    meal: {
      ...analysis,
      id: inserted.id,
      image_url: imageUrl,
    },
  }
}
