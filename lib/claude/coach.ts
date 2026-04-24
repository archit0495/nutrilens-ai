import Anthropic from '@anthropic-ai/sdk'
import type { Goal } from '@/lib/nutrition/calculator'

/**
 * Weekly coach — generates a short, personalized "Claude's take on your week"
 * block for the /history page using recent logging data + the user's targets.
 *
 * Shape is constrained via a tool_use schema so the server can render a rich
 * card (headline + observation chips + optional suggestion) without having to
 * parse free-form text. Icons are a fixed enum the client renders inline.
 *
 * Keep it supportive, factual, and specific. The system prompt explicitly
 * forbids diet-doctor moralizing — this is a hackathon demo, not a clinical
 * tool, and "your carbs are too high!" would be both wrong and off-brand.
 */

export type CoachIcon =
  | 'target'
  | 'trending-up'
  | 'trending-down'
  | 'flame'
  | 'leaf'
  | 'warning'
  | 'sparkles'
  | 'balance'

export interface CoachObservation {
  icon: CoachIcon
  text: string
}

export interface CoachSuggestion {
  text: string
  // Optional one-line action the user can do today (rendered as a nudge, not a
  // button — we don't want the card to feel like a chore list).
  action?: string
}

export interface CoachInsights {
  headline: string
  observations: CoachObservation[]
  suggestion?: CoachSuggestion
  // Reserved for future use — lets us soft-fail when Claude returns something
  // unusable without lighting up the whole card.
  tone?: 'positive' | 'neutral' | 'cautionary'
}

export interface CoachDaySummary {
  dateKey: string
  weekday: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  mealCount: number
}

export interface CoachInput {
  days: CoachDaySummary[]
  target: {
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  goal: Goal
  streak: number
  recentMealNames: Array<{ name: string; logged_at: string }>
}

const COACH_TOOL = {
  name: 'weekly_coach',
  description:
    "Respond with your weekly read on the user's nutrition logging. Call this tool exactly once.",
  input_schema: {
    type: 'object' as const,
    properties: {
      headline: {
        type: 'string',
        description:
          "Short, warm, specific headline summarizing the week (6-10 words). Examples: 'Strong protein week, easing into the weekend', 'Consistent mornings, softer weekends', 'Back on track after a quiet Tuesday'. Avoid generic cheerleading.",
      },
      tone: {
        type: 'string',
        enum: ['positive', 'neutral', 'cautionary'],
        description:
          "Overall tone of the read. 'cautionary' only when there's a concrete pattern worth flagging (e.g., very low intake for 3+ days). Default to 'positive' or 'neutral'.",
      },
      observations: {
        type: 'array',
        minItems: 2,
        maxItems: 3,
        description:
          "2-3 specific, data-grounded observations. Each should reference a concrete number or pattern from the data (e.g., 'averaged 125g protein — right at target'). Avoid vague platitudes.",
        items: {
          type: 'object',
          properties: {
            icon: {
              type: 'string',
              enum: [
                'target',
                'trending-up',
                'trending-down',
                'flame',
                'leaf',
                'warning',
                'sparkles',
                'balance',
              ],
              description:
                "Icon that matches the observation: 'target' for on-target stats, 'trending-up' / 'trending-down' for directional changes, 'flame' for streaks / effort, 'leaf' for healthy patterns, 'warning' for things to watch, 'sparkles' for standout moments, 'balance' for macro balance.",
            },
            text: {
              type: 'string',
              description:
                'One sentence, max ~18 words. Must reference specific data when possible. Talk TO the user (second person) in a friendly tone.',
            },
          },
          required: ['icon', 'text'],
        },
      },
      suggestion: {
        type: 'object',
        description:
          "Optional gentle suggestion for the week ahead. Only include when there's a concrete, actionable idea — never filler. Omit the whole field if nothing useful to add.",
        properties: {
          text: {
            type: 'string',
            description:
              'One sentence (~18 words max) suggesting a small, specific adjustment.',
          },
          action: {
            type: 'string',
            description:
              "Optional short phrase the user could try (e.g., 'Add a protein shake mid-afternoon'). Omit if the suggestion alone is enough.",
          },
        },
        required: ['text'],
      },
    },
    required: ['headline', 'tone', 'observations'],
  },
}

const SYSTEM_PROMPT = `You are the NutriLens weekly coach. The user logs meals via photo and text, and you get their last 14 days of daily totals plus recent meal names, their macro targets, their goal (lose/maintain/gain weight), and their current logging streak.

Your job: write a short, specific, supportive read on their week. Call the weekly_coach tool exactly once.

Voice:
- Warm, specific, and grounded in the numbers. "You averaged 125g protein — right at target" beats "Great protein!".
- Second person. Talk TO the user, not about them.
- Never moralize. No "should", "need to", "too much", "too little" — people hear a tutting tone even when you don't mean it. Frame as observation + option.
- Celebrate real wins when present. If the data is thin (few days logged), acknowledge that honestly without lecturing.
- Be specific to their goal: 'lose' → hitting under target matters; 'gain' → hitting calories matters; 'maintain' → consistency matters.

Constraints:
- 2-3 observations, max. Each must reference a real pattern or number you can see.
- Suggestion is optional. Skip it unless you have something concrete and non-obvious.
- Never suggest medical advice, supplements, skipping meals, or specific calorie deficits. Stick to nudges like portion, protein distribution, or adding a specific food group.
- If there's very little data (< 3 days logged), keep the tone encouraging and focus on momentum rather than analysis.
- Always call the weekly_coach tool. Never respond with plain text.`

/**
 * Call Claude to build a weekly-coach card payload. Uses Haiku 4.5 — the task
 * is structured, factual, and short, so the cheaper model is the right call.
 *
 * Throws if ANTHROPIC_API_KEY is missing so the caller can render a graceful
 * fallback card instead of a hard error.
 */
export async function generateCoachInsights(
  input: CoachInput
): Promise<CoachInsights> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.'
    )
  }

  const client = new Anthropic({ apiKey })

  const userContent = buildUserPrompt(input)

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    // Low (not zero) temperature — we want some stylistic variety in headlines
    // across the week without the model wandering into hallucinated numbers.
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    tools: [COACH_TOOL],
    tool_choice: { type: 'tool', name: 'weekly_coach' },
    messages: [{ role: 'user', content: userContent }],
  })

  const toolUse = response.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === 'tool_use' && b.name === 'weekly_coach'
  )

  if (!toolUse) {
    throw new Error('Coach did not return a weekly_coach tool call.')
  }

  return toolUse.input as CoachInsights
}

function buildUserPrompt(input: CoachInput): string {
  const { days, target, goal, streak, recentMealNames } = input

  // Present the daily table compactly — Claude reads this easily.
  const dailyRows = days
    .map(
      (d) =>
        `${d.dateKey} (${d.weekday}): ${d.mealCount > 0 ? `${Math.round(d.calories)} kcal · ${Math.round(d.protein_g)}p / ${Math.round(d.carbs_g)}c / ${Math.round(d.fat_g)}f · ${d.mealCount} meal${d.mealCount === 1 ? '' : 's'}` : 'no log'}`
    )
    .join('\n')

  const mealList =
    recentMealNames.length > 0
      ? recentMealNames
          .map((m) => `- ${m.logged_at.slice(0, 10)}: ${m.name}`)
          .join('\n')
      : '(no meals logged recently)'

  return `Here is the user's recent activity.

Targets (per day):
- Calories: ${target.calories.toLocaleString()} kcal
- Protein: ${target.protein_g}g
- Carbs: ${target.carbs_g}g
- Fat: ${target.fat_g}g

Goal: ${goal}
Current streak: ${streak} day${streak === 1 ? '' : 's'}

Last ${days.length} days of daily totals (oldest first):
${dailyRows}

Recent meals (newest first, up to 20):
${mealList}

Please call weekly_coach with your read on the week.`
}
