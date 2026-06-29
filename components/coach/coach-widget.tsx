'use client'

import * as React from 'react'
import { Sparkles, X, Send, Plus, Square } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

/** One chat turn held client-side. The thread is ephemeral (never persisted). */
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Starter prompts shown on an empty thread. */
const SUGGESTIONS = [
  'How is my training trending?',
  'What should I focus on this week?',
  'Am I on track for my goals?',
  'Is any lift stalling?',
]

/**
 * CoachWidget — a floating AI coach available on every screen. Click the bubble
 * to open a chat grounded in the athlete's real analytics (the server re-seeds
 * them every call). Conversations are intentionally ephemeral: closing or
 * reloading starts fresh, and "New chat" clears the thread — a new thread still
 * knows the athlete's goals/stats because the grounding is injected server-side.
 *
 * Rendered only for allowlisted accounts (the layout gates it); the /api/coach
 * route enforces the same gate defensively.
 */
export function CoachWidget() {
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState('')
  const [streaming, setStreaming] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const scrollRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLTextAreaElement>(null)
  const abortRef = React.useRef<AbortController | null>(null)
  const bubbleRef = React.useRef<HTMLButtonElement>(null)
  const prevOpen = React.useRef(false)

  // Return focus to the trigger bubble when the panel closes (dialog focus
  // order) — the bubble re-mounts on close, so refocus after that commit.
  React.useEffect(() => {
    if (prevOpen.current && !open) bubbleRef.current?.focus()
    prevOpen.current = open
  }, [open])

  // Keep the latest message in view as it streams.
  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, streaming])

  // Focus the composer when the panel opens.
  React.useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Esc closes the panel (when not mid-stream typing in the textarea).
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = React.useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || streaming) return

      setError(null)
      setInput('')
      const next: ChatMessage[] = [...messages, { role: 'user', content }]
      // Add an empty assistant turn we stream into.
      setMessages([...next, { role: 'assistant', content: '' }])
      setStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch('/api/coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error || `Request failed (${res.status}).`)
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          if (!chunk) continue
          setMessages((prev) => {
            const copy = prev.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              copy[copy.length - 1] = { ...last, content: last.content + chunk }
            }
            return copy
          })
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // User stopped the stream — keep partial text, but drop a bubble
          // that never received any tokens.
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.content === '') {
              return prev.slice(0, -1)
            }
            return prev
          })
        } else {
          const msg = e instanceof Error ? e.message : 'Something went wrong.'
          setError(msg)
          // Drop the empty/partial assistant bubble if nothing came back.
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last && last.role === 'assistant' && last.content === '') {
              return prev.slice(0, -1)
            }
            return prev
          })
        }
      } finally {
        setStreaming(false)
        abortRef.current = null
      }
    },
    [messages, streaming],
  )

  function stop() {
    abortRef.current?.abort()
  }

  function newChat() {
    if (streaming) abortRef.current?.abort()
    setMessages([])
    setError(null)
    setInput('')
    inputRef.current?.focus()
  }

  function onComposerKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input)
    }
  }

  return (
    <>
      {/* Floating bubble — sits above the mobile tab bar, clears safe areas. */}
      {!open ? (
        <button
          ref={bubbleRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open AI coach"
          className="fixed right-4 bottom-nav-room z-50 flex size-14 items-center justify-center rounded-full border border-signal/40 bg-signal text-signal-foreground shadow-lg shadow-black/20 transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-background md:right-6 md:bottom-6"
        >
          <Sparkles className="size-6" aria-hidden />
        </button>
      ) : null}

      {/* Mobile backdrop (desktop keeps the page visible behind a floating card). */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="AI coach chat"
          className={cn(
            'fixed z-50 flex flex-col overflow-hidden border border-border bg-surface shadow-2xl shadow-black/30',
            // Mobile: a bottom sheet that clears the home indicator.
            'inset-x-0 bottom-0 max-h-[88svh] rounded-t-2xl pb-[env(safe-area-inset-bottom)]',
            // Desktop: a floating card anchored bottom-right.
            'md:inset-x-auto md:right-6 md:bottom-6 md:h-[600px] md:max-h-[80vh] md:w-[400px] md:rounded-2xl md:pb-0',
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-signal" aria-hidden />
              <span className="text-sm font-semibold">Coach</span>
              <span className="text-[11px] text-muted">grounded in your stats</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={newChat}
                disabled={messages.length === 0 && !streaming}
                className="h-8 gap-1.5 px-2 text-muted hover:text-foreground"
              >
                <Plus className="size-3.5" aria-hidden />
                New
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close coach"
                className="size-8 text-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              <EmptyState onPick={(q) => void send(q)} disabled={streaming} />
            ) : (
              messages.map((m, i) => (
                <MessageBubble
                  key={i}
                  message={m}
                  // The trailing empty assistant bubble shows a typing indicator.
                  thinking={
                    streaming &&
                    i === messages.length - 1 &&
                    m.role === 'assistant' &&
                    m.content === ''
                  }
                />
              ))
            )}

            {error ? (
              <p
                role="alert"
                className="rounded-md border border-gate-red/40 bg-gate-red/10 px-3 py-2 text-xs text-gate-red"
              >
                {error}
              </p>
            ) : null}
          </div>

          {/* Announce the settled assistant reply once (not every token) so
              screen-reader users hear the answer without re-navigating. */}
          <div className="sr-only" role="status" aria-live="polite">
            {!streaming &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'assistant'
              ? messages[messages.length - 1].content
              : ''}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onComposerKey}
                rows={1}
                aria-label="Message the coach"
                placeholder="Ask about your training, goals, body…"
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal"
              />
              {streaming ? (
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={stop}
                  aria-label="Stop"
                  className="size-10 shrink-0"
                >
                  <Square className="size-4" aria-hidden />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  onClick={() => void send(input)}
                  disabled={!input.trim()}
                  aria-label="Send"
                  className="size-10 shrink-0"
                >
                  <Send className="size-4" aria-hidden />
                </Button>
              )}
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-muted">
              Coaching guidance from your numbers — not medical advice. Chats aren’t saved.
            </p>
          </div>
        </div>
      ) : null}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

function EmptyState({
  onPick,
  disabled,
}: {
  onPick: (q: string) => void
  disabled: boolean
}) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 py-6">
      <div className="space-y-1.5 text-center">
        <Sparkles className="mx-auto size-7 text-signal" aria-hidden />
        <p className="text-sm font-medium text-foreground">Ask your coach</p>
        <p className="text-xs text-muted">
          I already know your lifts, goals, body trend, and nutrition. Ask me anything.
        </p>
      </div>
      <div className="grid gap-2">
        {SUGGESTIONS.map((q) => (
          <button
            key={q}
            type="button"
            disabled={disabled}
            onClick={() => onPick(q)}
            className="rounded-md border border-border bg-background px-3 py-2 text-left text-sm text-foreground transition hover:border-signal/40 hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-50"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  )
}

function MessageBubble({
  message,
  thinking,
}: {
  message: ChatMessage
  thinking: boolean
}) {
  const isUser = message.role === 'user'
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed',
          isUser
            ? 'rounded-br-sm bg-signal text-signal-foreground'
            : 'rounded-bl-sm border border-border bg-background text-foreground',
        )}
      >
        {thinking ? (
          <TypingDots />
        ) : (
          <div className="whitespace-pre-wrap break-words">
            {renderInline(message.content)}
          </div>
        )}
      </div>
    </div>
  )
}

/** Light inline formatting: render **bold** spans; preserve everything else. */
function renderInline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={i}>{part.slice(2, -2)}</strong>
    }
    return <React.Fragment key={i}>{part}</React.Fragment>
  })
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1 py-1" aria-label="Coach is typing">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className="size-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </span>
  )
}
