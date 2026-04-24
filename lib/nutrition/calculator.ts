/**
 * Nutrition calculator — BMR, TDEE, and macro splits.
 *
 * Uses the Mifflin-St Jeor equation (most accurate for general population).
 */

export type Sex = 'male' | 'female'

export type ActivityLevel =
  | 'sedentary'      // little or no exercise
  | 'light'          // light exercise 1-3 days/week
  | 'moderate'       // moderate exercise 3-5 days/week
  | 'active'         // hard exercise 6-7 days/week
  | 'very_active'    // very hard exercise + physical job

export type Goal = 'lose' | 'maintain' | 'gain'

export interface UserStats {
  age: number
  sex: Sex
  height_cm: number
  weight_kg: number
  activity_level: ActivityLevel
  goal: Goal
}

export interface MacroTargets {
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
}

/**
 * Mifflin-St Jeor BMR (Basal Metabolic Rate) — calories burned at rest.
 *
 * Male:   BMR = 10 × weight + 6.25 × height − 5 × age + 5
 * Female: BMR = 10 × weight + 6.25 × height − 5 × age − 161
 */
export function calculateBMR(stats: Pick<UserStats, 'sex' | 'weight_kg' | 'height_cm' | 'age'>): number {
  const base = 10 * stats.weight_kg + 6.25 * stats.height_cm - 5 * stats.age
  return stats.sex === 'male' ? base + 5 : base - 161
}

/**
 * TDEE (Total Daily Energy Expenditure) — BMR × activity multiplier.
 */
const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

export function calculateTDEE(stats: UserStats): number {
  const bmr = calculateBMR(stats)
  return bmr * ACTIVITY_MULTIPLIERS[stats.activity_level]
}

/**
 * Adjust TDEE based on goal:
 *   lose:     -500 kcal/day (≈ 0.5 kg/week loss)
 *   maintain:  0
 *   gain:     +300 kcal/day (≈ 0.3 kg/week lean gain)
 */
const GOAL_ADJUSTMENTS: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 300,
}

export function calculateTargetCalories(stats: UserStats): number {
  const tdee = calculateTDEE(stats)
  return Math.round(tdee + GOAL_ADJUSTMENTS[stats.goal])
}

/**
 * Macro split (grams) from total calories.
 *
 * Defaults follow common nutrition guidelines:
 *   - Protein: 1.8 g/kg bodyweight (higher on a cut, supports muscle retention)
 *   - Fat:     25% of calories (minimum for hormonal health)
 *   - Carbs:   the remainder
 *
 * Protein = 4 kcal/g, Carbs = 4 kcal/g, Fat = 9 kcal/g.
 */
export function calculateMacros(stats: UserStats): MacroTargets {
  const calories = calculateTargetCalories(stats)

  // Protein: 1.8 g per kg bodyweight (slightly higher for fat loss)
  const proteinPerKg = stats.goal === 'lose' ? 2.0 : 1.8
  const protein_g = Math.round(stats.weight_kg * proteinPerKg)
  const proteinCalories = protein_g * 4

  // Fat: 25% of total calories
  const fatCalories = calories * 0.25
  const fat_g = Math.round(fatCalories / 9)

  // Carbs: remaining calories
  const carbsCalories = calories - proteinCalories - fat_g * 9
  const carbs_g = Math.max(0, Math.round(carbsCalories / 4))

  return {
    calories,
    protein_g,
    carbs_g,
    fat_g,
  }
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentary (desk job, no exercise)',
  light: 'Lightly active (1-3 days/week)',
  moderate: 'Moderately active (3-5 days/week)',
  active: 'Very active (6-7 days/week)',
  very_active: 'Extra active (physical job + daily training)',
}

export const GOAL_LABELS: Record<Goal, string> = {
  lose: 'Lose weight',
  maintain: 'Maintain weight',
  gain: 'Gain weight',
}
