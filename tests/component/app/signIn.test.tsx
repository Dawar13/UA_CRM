/**
 * Email and password sign-in (D-035) through SupabaseAuthProvider, with a fake Supabase client:
 * the sign-in screen, wrong passwords, a login that is not on the team, a deactivated member,
 * an unreachable database, sign-out and changing the password.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DEACTIVATED, NOT_ON_TEAM, useAuth } from '@/auth/AuthContext'
import { SignInScreen } from '@/auth/SignInScreen'
import { SupabaseAuthProvider } from '@/auth/SupabaseAuthProvider'

const DAWAR = {
  id: 'm-dawar',
  slug: 'dawar',
  name: 'Dawar',
  email: 'dawar@example.test',
  position: 0,
  isAdmin: true,
  active: true,
  createdAt: '2026-11-05T04:30:00.000Z',
}

type Session = { user: { id: string } } | null
type Listener = (event: string, session: Session) => void

interface FakeOptions {
  session?: Session
  me?: () => Promise<{ data: unknown; error: { message: string } | null }>
  password?: string
}

function fakeClient({ session = null, me, password = 'right-password' }: FakeOptions = {}) {
  let listener: Listener = () => {}
  const auth = {
    getSession: vi.fn(async () => ({ data: { session } })),
    onAuthStateChange: vi.fn((next: Listener) => {
      listener = next
      return { data: { subscription: { unsubscribe: vi.fn() } } }
    }),
    signInWithPassword: vi.fn(async (input: { email: string; password: string }) => {
      if (input.password === 'offline') throw new TypeError('Failed to fetch')
      if (input.password !== password) {
        return { error: { message: 'Invalid login credentials' } }
      }
      listener('SIGNED_IN', { user: { id: 'u-1' } })
      return { error: null }
    }),
    signOut: vi.fn(async () => {
      listener('SIGNED_OUT', null)
      return { error: null }
    }),
    updateUser: vi.fn(async ({ password: next }: { password: string }) => {
      if (next === 'weird') return { error: { message: 'Something unusual' } }
      if (next.length < 8)
        return { error: { message: 'Password should be at least 8 characters.' } }
      if (next === 'same-as-before') {
        return { error: { message: 'New password should be different from the old password.' } }
      }
      return { error: null }
    }),
  }
  const rpc = vi.fn(me ?? (async () => ({ data: DAWAR, error: null })))
  return { auth, rpc }
}

function Gate() {
  const auth = useAuth()
  const [results, setResults] = useState<string[]>([])
  if (auth.status === 'loading') return <p>Loading</p>
  if (auth.status === 'signed-out') return <SignInScreen />
  return (
    <div>
      <p>Signed in as {auth.member?.name}</p>
      <button type="button" onClick={() => void auth.signOut()}>
        Sign out
      </button>
      <button
        type="button"
        onClick={async () => {
          const all: string[] = []
          for (const next of ['short', 'same-as-before', 'weird', 'a-good-new-password']) {
            all.push((await auth.changePassword(next)) ?? 'Changed')
          }
          setResults(all)
        }}
      >
        Change password
      </button>
      <ul aria-label="Results">
        {results.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
    </div>
  )
}

function renderWith(client: ReturnType<typeof fakeClient>) {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      {/* The fake implements only what the provider calls. */}
      <SupabaseAuthProvider client={client as never}>
        <Gate />
      </SupabaseAuthProvider>
    </QueryClientProvider>,
  )
}

async function signIn(email: string, password: string) {
  const user = userEvent.setup()
  await user.type(await screen.findByLabelText('Email'), email)
  await user.type(screen.getByLabelText('Password'), password)
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
}

describe('signing in with email and password', () => {
  it('asks for both fields, then refuses a wrong password', async () => {
    const client = fakeClient()
    renderWith(client)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter your email and password.')
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()

    await signIn('dawar@example.test', 'wrong')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That email and password don't match.",
    )
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows and hides the password with the eye button, and still signs in', async () => {
    const client = fakeClient()
    renderWith(client)
    const user = userEvent.setup()
    const password = await screen.findByLabelText('Password')
    expect(password).toHaveAttribute('type', 'password')
    await user.type(password, 'right-password')
    const eye = screen.getByRole('button', { name: 'Show password' })
    expect(eye).toHaveAttribute('aria-pressed', 'false')
    await user.click(eye)
    expect(password).toHaveAttribute('type', 'text')
    expect(password).toHaveValue('right-password')
    expect(screen.getByRole('button', { name: 'Hide password' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // The eye is its own button: pressing it never submits the form.
    expect(client.auth.signInWithPassword).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(password).toHaveAttribute('type', 'password')
    await user.type(screen.getByLabelText('Email'), 'dawar@example.test')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText('Signed in as Dawar')).toBeInTheDocument()
  })

  it('says when the CRM cannot be reached', async () => {
    renderWith(fakeClient())
    await signIn('dawar@example.test', 'offline')
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the CRM.")
  })

  it('signs a team member in, and out again', async () => {
    const client = fakeClient()
    renderWith(client)
    await signIn(' dawar@example.test ', 'right-password')
    expect(await screen.findByText('Signed in as Dawar')).toBeInTheDocument()
    expect(client.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'dawar@example.test',
      password: 'right-password',
    })
    expect(client.rpc).toHaveBeenCalledWith('api_me')

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('restores a stored session without asking again', async () => {
    renderWith(fakeClient({ session: { user: { id: 'u-1' } } }))
    expect(await screen.findByText('Signed in as Dawar')).toBeInTheDocument()
  })

  it('turns away a login that is not on the team, and signs it out', async () => {
    const client = fakeClient({ me: async () => ({ data: null, error: null }) })
    renderWith(client)
    await signIn('stranger@example.test', 'right-password')
    expect(await screen.findByRole('alert')).toHaveTextContent(NOT_ON_TEAM)
    expect(client.auth.signOut).toHaveBeenCalled()
  })

  it('turns away a deactivated member', async () => {
    const client = fakeClient({
      me: async () => ({ data: { ...DAWAR, active: false }, error: null }),
    })
    renderWith(client)
    await signIn('dawar@example.test', 'right-password')
    expect(await screen.findByRole('alert')).toHaveTextContent(DEACTIVATED)
  })

  it('shows the connection message when the member check fails', async () => {
    renderWith(
      fakeClient({
        session: { user: { id: 'u-1' } },
        me: async () => ({ data: null, error: { message: 'timeout' } }),
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't reach the CRM.")
  })

  it('explains why a new password is refused', async () => {
    renderWith(fakeClient({ session: { user: { id: 'u-1' } } }))
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Change password' }))
    const results = screen.getByRole('list', { name: 'Results' })
    await waitFor(() =>
      expect(
        within(results)
          .getAllByRole('listitem')
          .map((li) => li.textContent),
      ).toEqual([
        'Use at least 8 characters.',
        'Choose a password you have not used here.',
        'Something unusual',
        'Changed',
      ]),
    )
  })
})
