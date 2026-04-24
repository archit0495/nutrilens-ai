import Anthropic from '@anthropic-ai/sdk'
import type { ActivityLevel, Goal } from '@/lib/nutrition/calculator'

/**
 * Chatbot backend — takes the user's chat history plus a snapshot of their
 * nutrition context (profile, today's totals, last 7 days, streak), builds a
 * rich system prompt, and streams Claude Haiku's response.
 *
 * Streaming approach: we return a Web ReadableStream of SSE-formatted text
 * deltas that the client can consume with fetch + reader. Keeping the wire
 * format simple (one `data: {json}\n\n` line per delta) avoids coupling the
 * client to the Anthropic SDK's raw event shape.
 */

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
}

export interface UserChatContext {
  profile: {
    fullName: string | null
    age: number
    sex: 'male' | 'female'
    height_cm: number
    weight_kg: number
    activity_level: ActivityLevel
    goal: Goal
    target_calories: number
    target_protein_g: number
    target_carbs_g: number
    target_fat_g: number
  }
  today: {
    dateKey: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    mealCount: number
    meals: Array<{
      name: string
      calories: number
      protein_g: number
      loggedAt: string
    }>
  }
  lastSevenDays: Array<{
    dateKey: string
    weekday: string
    calories: number
    protein_g: number
    mealCount: number
  }>
  streak: number
}

const GOAL_EXPLAINERS: Record<Goal, string> = {
  lose: 'lose weight (they benefit when actual intake lands under target)',
  maintain: 'maintain weight (consistency day-to-day matters most)',
  gain: 'gain weight (they benefit from actually hitting their calorie target)',
}

const ACTIVITY_EXPLAINERS: Record<ActivityLevel, string> = {
  sedentary: 'sedentary (little or no exercise)',
  light: 'lightly active (1-3 workouts/week)',
  moderate: 'moderately active (3-5 workouts/week)',
  active: 'very active (6-7 workouts/week)',
  very_active: 'extremely active (hard workouts + physical job)',
}

const SYSTEM_PROMPT_BASE = `You are the NutriLens in-app assistant. The user is chatting with you from a floating chat widget inside their nutrition app. You can see their profile, today's running totals, their last 7 days of eating, and their current logging streak.

Your job: answer questions about their day, give specific suggestions that fit their remaining macros, and explain patterns you see in their data. Be warm, specific, and grounded in the actual numbers.

Voice:
- Short, direct paragraphs. No walls of text. No bullet-point spam unless the user explicitly asks for a list.
- Reference real numbers when relevant ("you've got 48g of protein left today"), not vague platitudes ("eat more protein!").
- Never moralize. No "should", "need to", "too much", "too little" — people hear tutting even when you don't mean it. Frame as observation + option.
- Celebrate real wins. If the data shows consistency or a strong day, say so.
- If the user asks what they should eat, suggest 2-3 concrete options with rough macros, not generic food groups.

Do NOT:
- Give medical advice, diagnose, or recommend supplements.
- Suggest skipping meals or specific calorie deficits.
- Make up numbers — if you don't know something, say so.
- Pretend to log a meal — you can't. Tell the user to use the Log a meal button for that.
- Use emojis more than sparingly.

If asked something unrelated to nutrition (general chitchat, jokes, weather), answer briefly and steer back gently.`

function buildSystemPrompt(ctx: UserChatContext): string {
  const p = ctx.profile
  const t = ctx.today
  const proteinLeft = p.target_protein_g - Math.round(t.protein_g)
  const carbsLeft = p.target_carbs_g - Math.round(t.carbs_g)
  const fatLeft = p.target_fat_g - Math.round(t.fat_g)
  const caloriesLeft = p.target_calories - Math.round(t.calories)

  const todayMeals =
    t.meals.length > 0
      ? t.meals
          .map(
            (m) =>
              `  - ${m.loggedAt}: ${m.name} (${Math.round(m.calories)} kcal, ${Math.round(m.protein_g)}g P)`
          )
          .join('\n')
      : '  (nothing logged yet today)'

  const weekRows =
    ctx.lastSevenDays.length > 0
      ? ctx.lastSevenDays
          .map(
            (d) =>
              `  ${d.dateKey} (${d.weekday}): ${d.mealCount > 0 ? `${Math.round(d.calories)} kcal · ${Math.round(d.protein_g)}g P · ${d.mealCount} meal${d.mealCount === 1 ? '' : 's'}` : 'no log'}`
          )
          .join('\n')
      : '  (no data yet)'

  return `${SYSTEM_PROMPT_BASE}

---
USER CONTEXT — use this to ground your answers.

Name: ${p.fullName || 'the user'}
Age: ${p.age} · Sex: ${p.sex} · Height: ${p.height_cm}cm · Weight: ${p.weight_kg}kg
Activity: ${ACTIVITY_EXPLAINERS[p.activity_level]}
Goal: ${p.goal} — ${GOAL_EXPLAINERS[p.goal]}

Daily targets:
- Calories: ${p.target_calories.toLocaleString()} kcal
- Protein: ${p.target_protein_g}g
- Carbs: ${p.target_carbs_g}g
- Fat: ${p.target_fat_g}g

Today (${t.dateKey}):
- So far: ${Math.round(t.calories)} kcal, ${Math.round(t.protein_g)}g P, ${Math.round(t.carbs_g)}g C, ${Math.round(t.fat_g)}g F (${t.mealCount} meal${t.mealCount === 1 ? '' : 's'})
- Remaining: ${caloriesLeft} kcal, ${proteinLeft}g P, ${carbsLeft}g C, ${fatLeft}g F
- Meals logged today:
${todayMeals}

Last 7 days (newest last):
${weekRows}

Current logging streak: ${ctx.streak} day${ctx.streak === 1 ? '' : 's'}
---

Answer the user's next message using this context. Keep it tight.`
}

/**
 * Stream a chat response from Claude.
 *
 * Returns a Web ReadableStream that emits SSE-formatted text deltas:
 *   data: {"type":"text","delta":"Hello"}\n\n
 *   data: {"type":"text","delta":" there"}\n\n
 *   data: {"type":"done"}\n\n
 *
 * On error:
 *   data: {"type":"error","message":"..."}\n\n
 */
export function streamChatResponse({
  messages,
  context,
}: {
  messages: ChatMessage[]
  context: UserChatContext
}): ReadableStream<Uint8Array> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Surface a friendly error through the stream rather than 500ing — the
    // widget will show this inline like any other assistant turn.
    return new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message: 'Chat is not configured on the server yet.' })}\n\n`
          )
        )
        controller.close()
      },
    })
  }

  const client = new Anthropic({ apiKey })
  const systemPrompt = buildSystemPrompt(context)

  // Defensive: Claude rejects empty content / non-alternating turns. Filter
  // any zero-length messages and squash back-to-back same-role turns just in
  // case the client ever hiccups mid-stream.
  const cleaned: ChatMessage[] = []
  for (const m of messages) {
    const content = (m.content ?? '').trim()
    if (!content) continue
    if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === m.role) {
      cleaned[cleaned.length - 1].content += '\n\n' + content
    } else {
      cleaned.push({ role: m.role, content })
    }
  }
  // Claude requires the conversation to start with a user turn.
  while (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift()

  const encoder = new TextEncoder()

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = client.messages.stream({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1024,
          temperature: 0.6,
          system: systemPrompt,
          messages: cleaned.map((m) => ({ role: m.role, content: m.content })),
        })

        stream.on('text', (delta: string) => {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: 'text', delta })}\n\n`
            )
          )
        })

        await stream.finalMessage()

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`)
        )
        controller.close()
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Something went wrong.'
        console.error('[chat] stream failed:', err)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'error', message })}\n\n`
          )
        )
        controller.close()
      }
    },
  })
}
