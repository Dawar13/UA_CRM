/**
 * The duplicate check for rows that are already added (a new row from N, pasted rows, imported
 * rows): one review of everything that may already be in the CRM. For each: keep both, linked
 * as the same person; a different person (never asked again); or move the new row to Trash.
 */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { create } from 'zustand'
import { useJumpToRow } from '@/app/navigation'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { saveErrorMessage } from '@/data/hooks/rowEdits'
import { useRepository } from '@/data/RepositoryContext'
import type { DuplicateCandidate, Repository } from '@/data/repository'
import { matchReasonText } from '@/domain/dedupe/score'
import { pluralise } from '@/domain/format'
import type { Row } from '@/domain/types'
import { cn } from '@/lib/cn'

export interface ReviewItem {
  row: Row
  candidates: DuplicateCandidate[]
}

interface ReviewState {
  items: ReviewItem[] | null
  open: (items: ReviewItem[]) => void
  close: () => void
}

export const useDuplicateReview = create<ReviewState>((set) => ({
  items: null,
  open: (items) => set({ items }),
  close: () => set({ items: null }),
}))

/** Checks rows just added and opens the review when any may already exist. */
export async function reviewNewRows(repo: Repository, rows: readonly Row[]): Promise<void> {
  const items: ReviewItem[] = []
  for (const row of rows) {
    const candidates = await repo.findDuplicates(
      {
        name: row.name,
        phone: row.phone,
        email: row.email,
        linkedin: row.linkedin,
        company: row.company,
      },
      { selfId: row.id },
    )
    if (candidates.length > 0) items.push({ row, candidates: candidates.slice(0, 3) })
  }
  if (items.length > 0) useDuplicateReview.getState().open(items)
}

type Decision = 'link' | 'different' | 'remove'

const decisionLabel: Record<Decision, string> = {
  link: 'Keep both, linked',
  different: 'Different person',
  remove: 'Remove the new row',
}

export function DuplicateReviewDialog() {
  const items = useDuplicateReview((s) => s.items)
  const close = useDuplicateReview((s) => s.close)
  const repo = useRepository()
  const qc = useQueryClient()
  const actor = useActor()
  const jump = useJumpToRow()
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [saving, setSaving] = useState(false)

  const apply = async () => {
    if (!items || !actor) return
    setSaving(true)
    const ctx = () => ({ actorId: actor.id, now: new Date() })
    try {
      for (const item of items) {
        const decision = decisions[item.row.id]
        const match = item.candidates[0]
        if (!decision || !match) continue
        if (decision === 'link') {
          await repo.updateRow(
            item.row.id,
            { samePerson: [...(item.row.samePerson ?? []), match.location.row.id] },
            ctx(),
          )
        } else if (decision === 'different') {
          for (const c of item.candidates)
            await repo.markNotDuplicate(item.row.id, c.location.row.id, ctx())
        } else {
          await repo.deleteRows([item.row.id], ctx())
        }
      }
      setDecisions({})
      close()
      await qc.invalidateQueries()
    } catch (error) {
      toast.error(saveErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={items !== null}
      onOpenChange={(next) => {
        if (!next) {
          setDecisions({})
          close()
        }
      }}
    >
      <DialogContent
        title={
          items && items.length === 1
            ? 'This may already be in the CRM'
            : 'These may already be in the CRM'
        }
        description={
          items
            ? `${pluralise(items.length, 'new row')} look like someone already here.`
            : undefined
        }
        className="max-w-[600px]"
      >
        <ul className="flex max-h-[56vh] flex-col gap-3 overflow-y-auto">
          {items?.map((item) => {
            const match = item.candidates[0]
            if (!match) return null
            const { row, sheet, member } = match.location
            const mine = member.id === actor?.id
            return (
              <li
                key={item.row.id}
                className="flex flex-col gap-2 rounded-card border border-border p-3"
                data-testid="review-item"
              >
                <p className="text-sm">
                  <strong className="font-semibold">{item.row.name}</strong>
                  {' · '}
                  <span className={match.level === 'hard' ? 'text-cold' : 'text-waiting'}>
                    {matchReasonText[match.reason]}
                  </span>{' '}
                  as{' '}
                  <button
                    type="button"
                    className="font-medium text-link hover:underline"
                    onClick={() => {
                      close()
                      jump({ member, sheet, rowId: row.id })
                    }}
                  >
                    {row.name}
                  </button>{' '}
                  in {mine ? 'your' : `${member.name}'s`} {sheet.name}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(['link', 'different', 'remove'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={decisions[item.row.id] === d}
                      onClick={() => setDecisions((all) => ({ ...all, [item.row.id]: d }))}
                      className={cn(
                        'h-7 rounded-control border px-2.5 text-sm font-medium',
                        decisions[item.row.id] === d
                          ? 'border-focus text-text shadow-[0_0_0_1px_var(--focus)]'
                          : 'border-border text-secondary hover:text-text',
                      )}
                    >
                      {decisionLabel[d]}
                    </button>
                  ))}
                </div>
              </li>
            )
          })}
        </ul>
        <DialogFooter>
          <Button onClick={() => close()}>Decide later</Button>
          <Button variant="primary" disabled={saving} onClick={() => void apply()}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
