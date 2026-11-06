/**
 * The team: everyone on it, and (admins only) adding a member, deactivating and reactivating.
 * Admins get no extra rights over anyone's data (CLAUDE.md §2.14). A new member's login is made
 * in the Supabase dashboard (D-035).
 */
import { type FormEvent, useId, useState } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent } from '@/components/ui/Dialog'
import { Input } from '@/components/ui/Input'
import { useCreateMember, useMembers, useUpdateMember } from '@/data/hooks'
import { saveErrorMessage } from '@/data/hooks/rowEdits'
import { MemberRuleError } from '@/domain/members'
import { can } from '@/domain/permissions'

function AddMemberForm({ onAdded }: { onAdded: (name: string, email: string) => void }) {
  const { member: actor } = useAuth()
  const create = useCreateMember()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const nameId = useId()
  const emailId = useId()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!actor) return
    setError(null)
    create.mutate(
      { name, email, actorId: actor.id },
      {
        onSuccess: (member) => {
          setName('')
          setEmail('')
          onAdded(member.name, member.email)
        },
        onError: (e) => setError(e instanceof MemberRuleError ? e.message : saveErrorMessage(e)),
      },
    )
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Add a member"
      className="flex flex-col gap-2 rounded-card border border-dashed border-border p-3"
    >
      <div className="flex items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={nameId} className="text-xs font-medium text-secondary">
            Name
          </label>
          <Input
            id={nameId}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8"
          />
        </div>
        <div className="flex min-w-0 flex-[1.4] flex-col gap-1">
          <label htmlFor={emailId} className="text-xs font-medium text-secondary">
            Email
          </label>
          <Input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-8"
          />
        </div>
        <Button
          type="submit"
          variant="primary"
          disabled={!name.trim() || !email.trim() || create.isPending}
        >
          Add
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-cold">
          {error}
        </p>
      ) : null}
    </form>
  )
}

export function TeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { member: actor, mode } = useAuth()
  const { data: members = [] } = useMembers()
  const update = useUpdateMember()
  const [added, setAdded] = useState<{ name: string; email: string } | null>(null)
  const isAdmin = can(actor, 'addMember')

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setAdded(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        title="Team"
        description={
          isAdmin
            ? 'Add a member, or deactivate one. Admins have no extra rights over anyone’s sheets.'
            : 'Only an admin can change the team.'
        }
        className="max-w-[560px]"
      >
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y divide-border rounded-card border border-border">
            {members.map((m) => {
              const self = m.id === actor?.id
              return (
                <li
                  key={m.id}
                  className="flex items-center gap-3 px-3 py-2.5"
                  data-testid="team-member"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium text-text">
                      {m.name}
                      {self ? <span className="font-normal text-muted"> (you)</span> : null}
                    </span>
                    <span className="truncate text-xs text-muted">{m.email}</span>
                  </span>
                  {m.isAdmin ? (
                    <span className="rounded-chip bg-brand-tint px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-brand-tint-fg">
                      Admin
                    </span>
                  ) : null}
                  {m.active ? null : (
                    <span className="rounded-chip bg-surface-hover px-1.5 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-secondary">
                      Inactive
                    </span>
                  )}
                  {isAdmin && !self ? (
                    <Button
                      size="sm"
                      disabled={update.isPending}
                      onClick={() =>
                        actor &&
                        update.mutate({
                          member: m,
                          patch: { active: !m.active },
                          actorId: actor.id,
                        })
                      }
                    >
                      {m.active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          {isAdmin ? <AddMemberForm onAdded={(name, email) => setAdded({ name, email })} /> : null}
          {added ? (
            <p role="status" className="rounded-control bg-warm-bg px-3 py-2 text-sm text-warm">
              {mode === 'supabase'
                ? `${added.name} is on the team. Now create their login in Supabase (Authentication → Users → Add user) with ${added.email}, and share the password with them.`
                : `${added.name} is on the team, with their own tab.`}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
