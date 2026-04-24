import Anthropic from '@anthropic-ai/sdk'

// Single source of truth for what we extract from a meal photo.
// Used as the tool_use input_schema, and its shape matches the meals table columns.
export interface MealAnalysis {
  meal_name: string
  description: string
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  confidence: 'low' | 'medium' | 'high'
  notes?: string
}

const MEAL_TOOL = {
  name: 'log_meal',
  description:
    'Log the meal visible in the photo with your best estimate of the macronutrients. Call this tool exactly once with your analysis.',
  input_schema: {
    type: 'object' as const,
    properties: {
      meal_name: {
        type: 'string',
        description:
          "Short descriptive name of the meal (e.g., 'Grilled chicken with rice and broccoli', 'Caesar salad', 'Chocolate chip cookie').",
      },
      description: {
        type: 'string',
        description:
          "One-sentence description of what's on the plate and rough portion sizes you can see.",
      },
      calories: {
        type: 'integer',
        description: 'Estimated total calories in kcal.',
      },
      protein_g: {
        type: 'number',
        description: 'Estimated grams of protein.',
      },
      carbs_g: {
        type: 'number',
        description: 'Estimated grams of carbohydrates.',
      },
      fat_g: {
        type: 'number',
        description: 'Estimated grams of fat.',
      },
      confidence: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description:
          "How confident are you in the macro estimates? 'low' if the image is ambiguous, portions are hard to judge, or the food is unfamiliar; 'high' only when you can clearly identify the food and estimate portions well.",
      },
      notes: {
        type: 'string',
        description:
          'Optional notes for the user: caveats about portion estimation, assumptions you made, or tips (e.g., "assumed 1 cup of rice").',
      },
    },
    required: ['meal_name', 'description', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence'],
  },
}

const PHOTO_SYSTEM_PROMPT = `You are NutriLens, an AI nutrition analyst. The user will send a photo of a meal. Your job:

1. Identify the food(s) visible in the photo.
2. Estimate portion sizes using any available visual cues (plate size, utensils, hand, bowl depth).
3. Estimate total macronutrients for the entire meal shown.
4. Call the log_meal tool exactly once with your analysis.

Guidelines:
- Be realistic. Most restaurant and home-cooked meals fall between 300–900 kcal. Be skeptical of your own outliers.
- If you can't tell the portion, assume typical single-serving sizes for the cuisine.
- Macros must be internally consistent: calories ≈ (protein_g × 4) + (carbs_g × 4) + (fat_g × 9), within ~10%.
- Use confidence="low" for ambiguous photos, obscured food, or unfamiliar cuisine.
- Use confidence="medium" for clearly visible common foods.
- Use confidence="high" only when the food is unambiguous AND you have good portion cues.
- If the image does not show food at all, still call the tool but set everything to 0 and note it in the description.
- Always call the log_meal tool. Never respond with plain text.`

const TEXT_SYSTEM_PROMPT = `You are NutriLens, an AI nutrition analyst. The user will describe a meal in natural language. Your job:

1. Parse the food items and quantities from the description.
2. When quantities are explicit (grams, cups, tbsp, pieces, oz), use them precisely and trust them.
3. When quantities are vague ("a handful", "some", "a bit"), assume typical single-serving sizes.
4. Sum macros across all items in the meal.
5. Call the log_meal tool exactly once with your analysis.

Guidelines:
- Treat explicit numeric amounts as ground truth — don't second-guess "150g chicken".
- Common-knowledge macro values: 1g protein = 4 kcal, 1g carbs = 4 kcal, 1g fat = 9 kcal.
- Macros must be internally consistent: calories ≈ (protein_g × 4) + (carbs_g × 4) + (fat_g × 9), within ~10%.
- meal_name should be a short summary of the meal (e.g., "Chicken, rice, and broccoli").
- description should be a one-line summary of what was logged, restating amounts.
- Use confidence="high" when most amounts are explicit AND foods are common/well-known.
- Use confidence="medium" when amounts are implied but foods are common.
- Use confidence="low" when the description is vague or contains unusual/unfamiliar items.
- If the description is empty, nonsensical, or not food, return zero macros and note it in description.
- Always call the log_meal tool. Never respond with plain text.`

export async function analyzeMealPhoto(imageUrl: string): Promise<MealAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.')
  }

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    // Sonnet 4.6 for vision — meaningfully better portion perception than Haiku.
    // Kept Haiku on the text path (below) since the user already provides amounts.
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    // Temperature 0 ⇒ greedy decoding. Same photo + same prompt ⇒ same macros.
    // Without this, the API defaults to 1.0 and we get sampling variance
    // (the "same bowl came back 685 kcal then 580 kcal" problem).
    temperature: 0,
    system: PHOTO_SYSTEM_PROMPT,
    tools: [MEAL_TOOL],
    tool_choice: { type: 'tool', name: 'log_meal' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'url', url: imageUrl },
          },
          {
            type: 'text',
            text: 'Analyze this meal and call log_meal with your estimate.',
          },
        ],
      },
    ],
  })

  return extractMealAnalysis(response)
}

export async function analyzeMealText(description: string): Promise<MealAnalysis> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the dev server.')
  }

  const trimmed = description.trim()
  if (!trimmed) {
    throw new Error('Please describe your meal.')
  }

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    // Greedy decoding so "150g chicken" always maps to the same macros.
    temperature: 0,
    system: TEXT_SYSTEM_PROMPT,
    tools: [MEAL_TOOL],
    tool_choice: { type: 'tool', name: 'log_meal' },
    messages: [
      {
        role: 'user',
        content: `Here is what I ate:\n\n${trimmed}\n\nAnalyze this meal and call log_meal with your estimate.`,
      },
    ],
  })

  return extractMealAnalysis(response)
}

function extractMealAnalysis(response: Anthropic.Message): MealAnalysis {
  const toolUse = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === 'log_meal'
  )

  if (!toolUse) {
    throw new Error('Claude did not return a log_meal tool call.')
  }

  return toolUse.input as MealAnalysis
}
