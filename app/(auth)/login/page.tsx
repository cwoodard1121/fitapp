'use client'

import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Loader2, Mail } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [verifying, setVerifying] = useState(false)

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
      toast.error(error.message || 'Could not send the email. Try again.')
      return
    }
    setSent(true)
  }

  async function onVerify(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const token = code.replace(/\D/g, '')
    if (token.length < 6) {
      toast.error('Enter the full code from the email.')
      return
    }

    setVerifying(true)
    const supabase = createClient()
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: 'email',
    })
    setVerifying(false)

    if (error) {
      toast.error(error.message || 'That code did not work. Check it and retry.')
      return
    }
    // Full navigation so the middleware sees the freshly-set session cookie.
    window.location.href = '/today'
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
            No password. We email you a link and a code.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-5 shadow-sm">
          {sent ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-signal">
                  <Mail className="h-5 w-5" aria-hidden />
                </div>
                <div className="space-y-1">
                  <h2 className="text-base font-medium">Check your email</h2>
                  <p className="text-sm text-muted">
                    Sent to{' '}
                    <span className="font-mono text-foreground">
                      {email.trim()}
                    </span>
                    . Tap the link — or if you installed the app, enter the
                    code below.
                  </p>
                </div>
              </div>

              {/* Code entry — the reliable path for the installed PWA, where the
                  email link would open in a separate browser. */}
              <form onSubmit={onVerify} className="space-y-3">
                <div className="space-y-2">
                  <label
                    htmlFor="code"
                    className="block text-sm font-medium text-foreground"
                  >
                    Code from the email
                  </label>
                  <input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]*"
                    maxLength={10}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 10))
                    }
                    placeholder="12345678"
                    disabled={verifying}
                    className="h-12 w-full rounded-md border border-border bg-background px-3 text-center font-mono text-lg tracking-[0.3em] text-foreground placeholder:tracking-normal placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={verifying}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-signal px-4 text-sm font-semibold text-signal-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-60"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      Verifying
                    </>
                  ) : (
                    'Verify code & sign in'
                  )}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setSent(false)
                  setCode('')
                }}
                className="text-sm font-medium text-signal underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
                    Sending
                  </>
                ) : (
                  'Email me a link + code'
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
