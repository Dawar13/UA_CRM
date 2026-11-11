/**
 * The account section of the header's More menu: who is signed in, and (Supabase mode) change
 * password and sign out. In local mode, the sample team: act as another member.
 */
import { KeyRound, LogOut, WifiOff } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/auth/AuthContext'
import { OFFLINE_MESSAGE } from '@/auth/useCan'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { PasswordInput } from '@/components/ui/Input'
import {
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
} from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import type { Member } from '@/domain/types'
import { useOnline } from '@/lib/useOnline'

export function AccountMenuItems({
  members,
  onChangePassword,
}: {
  members: readonly Member[]
  onChangePassword: () => void
}) {
  const auth = useAuth()
  if (!auth.member) return null
  return (
    <>
      <MenuGroup>
        <MenuLabel>Signed in as {auth.member.name}</MenuLabel>
        {auth.mode === 'supabase' ? (
          <>
            <MenuItem
              onSelect={onChangePassword}
              icon={<KeyRound aria-hidden className="size-4" />}
            >
              Change password
            </MenuItem>
            <MenuItem
              onSelect={() => void auth.signOut()}
              icon={<LogOut aria-hidden className="size-4" />}
            >
              Sign out
            </MenuItem>
          </>
        ) : (
          <MenuRadioGroup
            value={auth.member.id}
            onValueChange={(id) => auth.signInAs?.(id)}
            aria-label="Act as"
          >
            {members
              .filter((m) => m.active)
              .map((m) => (
                <MenuRadioItem key={m.id} value={m.id}>
                  Act as {m.name}
                </MenuRadioItem>
              ))}
          </MenuRadioGroup>
        )}
      </MenuGroup>
      <MenuSeparator />
    </>
  )
}

export function ChangePasswordDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { changePassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const passwordId = useId()
  const confirmId = useId()

  const close = (next: boolean) => {
    if (!next) {
      setPassword('')
      setConfirm('')
      setError(null)
    }
    onOpenChange(next)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (password !== confirm) {
      setError('The two passwords are different.')
      return
    }
    setBusy(true)
    const result = await changePassword(password)
    setBusy(false)
    if (result) {
      setError(result)
      return
    }
    close(false)
    toast('Password changed')
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent title="Change password" description="Use it the next time you sign in.">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor={passwordId} className="text-sm font-medium">
              New password
            </label>
            <PasswordInput
              id={passwordId}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={confirmId} className="text-sm font-medium">
              Type it again
            </label>
            <PasswordInput
              id={confirmId}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-cold">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={busy || password.length === 0}>
              {busy ? 'Saving…' : 'Change password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** A quiet notice in the header while the connection is down (Supabase mode). */
export function OfflineNotice() {
  const { mode } = useAuth()
  const online = useOnline()
  if (mode !== 'supabase' || online) return null
  return (
    <Tooltip content={OFFLINE_MESSAGE}>
      <span
        role="status"
        className="inline-flex h-7 items-center gap-1.5 rounded-chip border border-waiting-border bg-waiting-bg px-2 text-xs font-medium text-waiting"
        data-testid="offline-notice"
      >
        <WifiOff aria-hidden className="size-3.5" />
        Offline · changes paused
      </span>
    </Tooltip>
  )
}
