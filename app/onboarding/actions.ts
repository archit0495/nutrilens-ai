'use server'

import { createClient } from '@/lib/supabase/server'
import { calculateMacros, type UserStats, type Sex, type ActivityLevel, type Goal } from '@/lib/nutrition/calculator'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function saveOnboarding(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'You must be logged in.' }
  }

  // Parse and validate form fields
  const full_name = (formData.get('full_name') as string || '').trim()
  const age = parseInt(formData.get('age') as string, 10)
  const sex = formData.get('sex') as Sex
  const height_cm = parseFloat(formData.get('height_cm') as string)
  const weight_kg = parseFloat(formData.get('weight_kg') as string)
  const activity_level = formData.get('activity_level') as ActivityLevel
  const goal = formData.get('goal') as Goal

  // Basic validation
  if (!full_name) return { error: 'Please enter your name.' }
  if (!age || age < 13 || age > 120) return { error: 'Please enter a valid age (13-120).' }
  if (sex !== 'male' && sex !== 'female') return { error: 'Please select a sex.' }
  if (!height_cm || height_cm < 100 || height_cm > 250) return { error: 'Please enter a valid height (100-250 cm).' }
  if (!weight_kg || weight_kg < 30 || weight_kg > 300) return { error: 'Please enter a valid weight (30-300 kg).' }
  if (!['sedentary', 'light', 'moderate', 'active', 'very_active'].includes(activity_level)) {
    return { error: 'Please select an activity level.' }
  }
  if (!['lose', 'maintain', 'gain'].includes(goal)) {
    return { error: 'Please select a goal.' }
  }

  const stats: UserStats = { age, sex, height_cm, weight_kg, activity_level, goal }
  const macros = calculateMacros(stats)

  // Save to profiles table
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name,
      age,
      sex,
      height_cm,
      weight_kg,
      activity_level,
      goal,
      target_calories: macros.calories,
      target_protein_g: macros.protein_g,
      target_carbs_g: macros.carbs_g,
      target_fat_g: macros.fat_g,
      onboarded: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)

  if (error) {
    return { error: error.message }
  }

  revalidatePath('/', 'layout')
  redirect('/dashboard')
}
