/**
 * A tab with no sheets. Your own tab offers "Start with the UA templates" (the five standard
 * sheets) or a single new sheet; someone else's says they have none yet.
 */
import { useState } from 'react'
import { useActor } from '@/auth/AuthContext'
import { useEditGate } from '@/auth/useCan'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { useCreateStandardSheets } from '@/data/hooks'
import type { Member } from '@/domain/types'
import { NewSheetDialog } from './NewSheetDialog'

export function NoSheets({ member }: { member: Member }) {
  const gate = useEditGate(member)
  const actor = useActor()
  const standard = useCreateStandardSheets()
  const [newOpen, setNewOpen] = useState(false)

  if (gate.viewOnly) {
    return (
      <EmptyState
        title="No sheets yet."
        description={`${member.name} has not made any sheets yet.`}
        art
      />
    )
  }
  return (
    <>
      <EmptyState
        title="Start with the UA templates."
        description="Customers, Investors, Advisors and experts, Connectors and Service providers, each with its own columns and stages."
        art
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              disabled={!actor || standard.isPending || !gate.editable}
              onClick={() => actor && standard.mutate({ memberId: member.id, actorId: actor.id })}
            >
              Start with the UA templates
            </Button>
            <Button onClick={() => setNewOpen(true)} disabled={!gate.editable}>
              One sheet
            </Button>
          </div>
        }
      />
      <NewSheetDialog member={member} open={newOpen} onOpenChange={setNewOpen} />
    </>
  )
}
