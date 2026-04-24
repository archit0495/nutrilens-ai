'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Floating chatbot widget.
 *
 * Mounted globally in the root layout. Self-hides on the auth/landing flows
 * where a chat button would be off-brand. Keeps history in React state only
 * (no persistence) — opening the widget on a new page load starts fresh.
 *
 * Streaming: we POST the message list to /api/chat and read the SSE stream
 * from the response body, appending text deltas to the in-flight assistant
 * message as they arrive.
 */

type ChatRole = 'user' | 'assistant'

interface ChatMessage {
  role: ChatRole
  content: string
}

const HIDDEN_ROUTES = new Set(['/', '/login', '/onboarding'])

export default function ChatWidget() {
  const pathname = usePathname() ?? ''
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-scroll to the bottom whenever messages change.
  useEffect(() => {
    if (!scrollerRef.current) return
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight
  }, [messages, streaming])

  // Focus input when the panel opens.
  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Close with Escape.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Abort any in-flight request when the component unmounts.
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

  // Hide entirely on auth/landing pages. Hook order must not change, so this
  // early-return runs AFTER all the hooks above.
  if (HIDDEN_ROUTES.has(pathname)) return null

  async function sendMessage(text: string) {
    const trimmed = text.trim()
    if (!trimmed || streaming) return

    setError(null)
    // Kick off: append user msg + an empty assistant msg we'll stream into.
    const nextHistory: ChatMessage[] = [
      ...messages,
      { role: 'user', content: trimmed },
    ]
    const sendHistory: ChatMessage[] = nextHistory.slice()
    nextHistory.push({ role: 'assistant', content: '' })
    setMessages(nextHistory)
    setInput('')
    setStreaming(true)

    const ac = new AbortController()
    abortRef.current = ac

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: sendHistory }),
        signal: ac.signal,
      })

      if (!res.ok || !res.body) {
        const text = await safeReadText(res)
        throw new Error(text || `Request failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE events are separated by a blank line. Process complete events,
        // keep the (possibly partial) trailing chunk in the buffer.
        let idx: number
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const raw = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          handleSseEvent(raw)
        }
      }
    } catch (err) {
      if (ac.signal.aborted) return
      const msg = err instanceof Error ? err.message : 'Chat failed.'
      setError(msg)
      // Remove the empty assistant message we optimistically appended.
      setMessages((m) => {
        if (m.length > 0 && m[m.length - 1].role === 'assistant' && m[m.length - 1].content === '') {
          return m.slice(0, -1)
        }
        return m
      })
    } finally {
      setStreaming(false)
      abortRef.current = null
    }

    function handleSseEvent(raw: string) {
      // Each line in the event is either `data: ...` or `event: ...` etc. We
      // only emit `data:` lines from the server, so parsing is trivial.
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (!payload) continue
        let msg: { type: string; delta?: string; message?: string }
        try {
          msg = JSON.parse(payload)
        } catch {
          continue
        }
        if (msg.type === 'text' && typeof msg.delta === 'string') {
          const delta = msg.delta
          setMessages((m) => {
            if (m.length === 0) return m
            const last = m[m.length - 1]
            if (last.role !== 'assistant') return m
            const next = m.slice(0, -1)
            next.push({ role: 'assistant', content: last.content + delta })
            return next
          })
        } else if (msg.type === 'error') {
          setError(msg.message ?? 'Something went wrong.')
          setMessages((m) => {
            if (
              m.length > 0 &&
              m[m.length - 1].role === 'assistant' &&
              m[m.length - 1].content === ''
            ) {
              return m.slice(0, -1)
            }
            return m
          })
        }
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    sendMessage(input)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter = send, Shift+Enter = newline.
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const hasConversation = messages.length > 0

  return (
    <>
      {/* Floating launcher button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className={`fixed z-50 bottom-4 right-4 sm:bottom-6 sm:right-6 w-14 h-14 rounded-full bg-gradient-to-br from-orange-500 via-amber-500 to-rose-500 text-white shadow-lg hover:shadow-xl hover:scale-[1.04] active:scale-[0.96] transition ${
          open ? 'rotate-180' : ''
        }`}
      >
        <span className="sr-only">{open ? 'Close chat' : 'Open chat'}</span>
        {open ? (
          <svg
            className="w-6 h-6 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 6l12 12M6 18L18 6" />
          </svg>
        ) : (
          <svg
            className="w-6 h-6 mx-auto"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M21 12c0 4.418-4.03 8-9 8a9.6 9.6 0 01-3.8-.78L3 20l1.22-4.03A8.3 8.3 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        )}
      </button>

      {/* Slide-in panel */}
      {open && (
        <div
          role="dialog"
          aria-label="NutriLens assistant"
          className="fixed z-40 bottom-20 sm:bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[380px] max-h-[min(640px,calc(100vh-6rem))] flex flex-col rounded-3xl border border-white/80 bg-white/90 backdrop-blur-md shadow-2xl anim-fade-up"
        >
          {/* Header */}
          <div className="flex items-center gap-2.5 p-4 border-b border-orange-100/70">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-sm font-bold shadow-sm">
              C
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 leading-tight">
                Ask Claude
              </p>
              <p className="text-[11px] text-orange-700/80 font-medium">
                Your NutriLens assistant
              </p>
            </div>
          </div>

          {/* Message list */}
          <div
            ref={scrollerRef}
            className="flex-1 min-h-[240px] overflow-y-auto px-4 py-3 space-y-3"
          >
            {!hasConversation ? (
              <EmptyState onPick={(q) => sendMessage(q)} />
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  role={m.role}
                  content={m.content}
                  pending={
                    streaming &&
                    i === messages.length - 1 &&
                    m.role === 'assistant' &&
                    m.content === ''
                  }
                />
              ))
            )}
            {error && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 text-rose-800 text-xs px-3 py-2">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <form
            onSubmit={onSubmit}
            className="p-3 border-t border-orange-100/70"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask about your day…"
                disabled={streaming}
                className="flex-1 resize-none px-3 py-2 max-h-24 bg-white border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 focus:border-transparent disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={streaming || input.trim().length === 0}
                aria-label="Send"
                className="shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-rose-500 text-white shadow-sm hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center justify-center"
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M3.105 2.289a.75.75 0 00-.826.95l2.074 6.902A.75.75 0 005.074 10h5.176a.75.75 0 010 1.5H5.074a.75.75 0 00-.72.96l-2.074 6.902a.75.75 0 00.994.882l14.25-6.75a.75.75 0 000-1.354L3.106 2.289z" />
                </svg>
              </button>
            </div>
            <p className="mt-1.5 text-[10px] text-gray-400 text-center">
              Powered by Claude Haiku · Enter to send, Shift+Enter for newline
            </p>
          </form>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  const suggestions = [
    'How am I doing today?',
    'What fits my remaining macros?',
    'Any patterns in my last week?',
  ]
  return (
    <div className="text-center py-4">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-sm font-bold shadow-sm mb-3">
        👋
      </div>
      <p className="text-sm text-gray-800 font-medium">
        Hey — ask me anything about your day.
      </p>
      <p className="text-xs text-gray-500 mt-1">
        I can see your targets, what you&apos;ve logged, and your recent patterns.
      </p>
      <div className="mt-4 flex flex-col gap-1.5">
        {suggestions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="text-left text-xs px-3 py-2 rounded-2xl bg-orange-50 hover:bg-orange-100 text-orange-800 border border-orange-100 transition"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  role,
  content,
  pending,
}: {
  role: ChatRole
  content: string
  pending: boolean
}) {
  if (role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-br-md bg-gradient-to-br from-orange-500 to-rose-500 text-white text-sm shadow-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    )
  }
  return (
    <div className="flex gap-2 items-start">
      <span className="shrink-0 mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-xl bg-gradient-to-br from-orange-400 to-rose-400 text-white text-[11px] font-bold shadow-sm">
        C
      </span>
      <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-md bg-white border border-orange-100/80 text-sm text-gray-800 shadow-sm whitespace-pre-wrap">
        {pending ? <TypingDots /> : content}
      </div>
    </div>
  )
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Claude is typing">
      <span className="w-1.5 h-1.5 rounded-full bg-orange-300 animate-bounce [animation-delay:-0.2s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.1s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-bounce" />
    </span>
  )
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
