/**
 * The sign-in screen (Supabase mode): the brand lockup on a paper card over the soft sampled
 * gradient, email and password, one primary button. Errors and notices sit inside the card.
 */
import { type FormEvent, useId, useState } from 'react'
import { BrandLockup } from '@/components/crm/BrandLockup'
import { Button } from '@/components/ui/Button'
import { Input, PasswordInput } from '@/components/ui/Input'
import { softGradient } from '@/styles/tokens'
import { useAuth } from './AuthContext'

export function SignInScreen() {
  const { signIn, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const messageId = useId()
  const message = error ?? notice

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    const result = await signIn(email, password)
    setBusy(false)
    if (result) setError(result)
  }

  return (
    <main
      className="relative grid min-h-dvh place-items-center overflow-hidden bg-bg px-4 py-10"
      data-testid="sign-in"
    >
      {/* The soft gradient, as a quiet wash behind the card. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[55%] opacity-35 blur-3xl dark:opacity-20"
        style={{ backgroundImage: softGradient.css }}
      />
      <form
        noValidate
        onSubmit={submit}
        aria-describedby={message ? messageId : undefined}
        className="relative w-full max-w-[380px] rounded-card border border-border bg-surface-raised p-7 shadow-card"
      >
        <BrandLockup />
        <h1 className="mt-7 text-[20px] leading-tight font-semibold tracking-[-0.01em] text-text">
          Sign in
        </h1>
        <p className="mt-1.5 text-sm text-secondary">
          Use the email and password a founder set up for you.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={emailId} className="text-sm font-medium text-text">
              Email
            </label>
            <Input
              id={emailId}
              type="email"
              name="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-9"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium text-text">
              Password
            </label>
            <PasswordInput
              id={passwordId}
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-9"
            />
          </div>
        </div>

        {message ? (
          <p
            id={messageId}
            role="alert"
            className="mt-4 rounded-control border border-cold-border bg-cold-bg px-3 py-2 text-sm text-cold"
          >
            {message}
          </p>
        ) : null}

        <Button type="submit" variant="primary" className="mt-6 h-9 w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
    </main>
  )
}
