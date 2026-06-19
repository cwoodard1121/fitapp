'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) {
      toast.error('Enter your email to continue.')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    setLoading(false)

    if (error) {
      toast.error(error.message || 'Could not send the link. Try again.')
      return
    }
    setSent(true)
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background px-5 py-10 text-foreground">
      <div className="w-full max-w-sm">
        {/* Brand / instrument header */}
        <div className="mb-8 flex flex-col items-start gap-1">
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted">
            simplegym
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sign in to train
          </h1>
          <p className="text-sm text-muted">
            One link, no password. We email you a magic link.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {sent ? (
            <div className="flex flex-col items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md border border-border bg-background text-signal">
                <Mail className="h-5 w-5" aria-hidden />
              </div>
              <div className="space-y-1">
                <h2 className="text-base font-medium">Check your email</h2>
                <p className="text-sm text-muted">
                  We sent a sign-in link to{' '}
                  <span className="font-mono text-foreground">{email.trim()}</span>.
                  Open it on this device to continue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="mt-1 text-sm font-medium text-signal underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground"
                >
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoFocus
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={loading}
                  className="h-12 w-full rounded-md border border-border bg-background px-3 font-mono text-sm text-foreground placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-signal-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Sending link
                  </>
                ) : (
                  'Send magic link'
                )}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-muted">
          By continuing you agree to keep training hard.
        </p>
      </div>
    </main>
  )
}
