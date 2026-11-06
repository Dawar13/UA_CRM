/**
 * Editing a sheet's stages: rename, reorder, add and remove. The last stage is the win, so
 * marking a stage as the win moves it to the end. Removing a stage that rows sit at asks where
 * those rows go, as a second step.
 */
import { ArrowDown, ArrowUp, Plus, Trophy, X } from 'lucide-react'
import { type FormEvent, useId, useMemo, useState } from 'react'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import { useEditStages, useRows } from '@/data/hooks'
import { pluralise } from '@/domain/format'
import { rowsAtStages, type StageMoves } from '@/domain/sheetEdits'
import type { Sheet, StageDef } from '@/domain/types'

export function StageEditorDialog({
  sheet,
  open,
  onOpenChange,
}: {
  sheet: Sheet
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const actor = useActor()
  const { data: rows = [] } = useRows(sheet.id)
  const edit = useEditStages()
  const [stages, setStages] = useState<StageDef[]>(sheet.stages)
  const [adding, setAdding] = useState('')
  const [step, setStep] = useState<'edit' | 'moves'>('edit')
  const [moves, setMoves] = useState<Record<string, string>>({})
  const addId = useId()
  const counts = useMemo(() => rowsAtStages(sheet, rows), [sheet, rows])

  const reset = (next: boolean) => {
    if (next) {
      setStages(sheet.stages)
      setStep('edit')
      setMoves({})
      setAdding('')
    }
    onOpenChange(next)
  }

  const removed = sheet.stages.filter((s) => !stages.some((x) => x.id === s.id))
  const removedWithRows = removed.filter((s) => (counts.get(s.id) ?? 0) > 0)

  const move = (from: number, to: number) => {
    setStages((list) => {
      const next = [...list]
      const [item] = next.splice(from, 1)
      if (item) next.splice(to, 0, item)
      return next
    })
  }

  const add = () => {
    const name = adding.trim()
    if (!name) return
    // A new stage goes before the win, unless there is none yet.
    setStages((list) =>
      list.length === 0
        ? [{ id: crypto.randomUUID(), name }]
        : [...list.slice(0, -1), { id: crypto.randomUUID(), name }, ...list.slice(-1)],
    )
    setAdding('')
  }

  const save = () => {
    if (!actor) return
    const chosen: StageMoves = Object.fromEntries(
      removed.map((s) => {
        const pick = moves[s.id]
        // Defaults: the stage before it that stays, or no stage.
        if (pick === undefined) {
          const before = sheet.stages
            .slice(
              0,
              sheet.stages.findIndex((x) => x.id === s.id),
            )
            .reverse()
            .find((x) => stages.some((k) => k.id === x.id))
          return [s.id, before?.id ?? null]
        }
        return [s.id, pick === '' ? null : pick]
      }),
    )
    edit.mutate(
      { sheet, stages, moves: chosen, actorId: actor.id },
      { onSuccess: () => reset(false) },
    )
  }

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (step === 'edit' && removedWithRows.length > 0) {
      setStep('moves')
      return
    }
    save()
  }

  const valid = stages.every((s) => s.name.trim() !== '')

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogContent
        title={step === 'edit' ? `Stages of ${sheet.name}` : 'Where should those rows go?'}
        description={
          step === 'edit'
            ? 'The last stage is the win. Each row keeps its stage when you reorder.'
            : 'Rows sit at the stages you removed. Choose a stage for each.'
        }
        className="max-w-[460px]"
      >
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {step === 'edit' ? (
            <>
              <ol aria-label="Stages" className="flex flex-col gap-1.5" data-testid="stage-list">
                {stages.map((stage, i) => {
                  const isWin = i === stages.length - 1
                  const count = counts.get(stage.id) ?? 0
                  return (
                    <li key={stage.id} className="flex items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right font-mono text-xs text-muted tabular-nums">
                        {i + 1}
                      </span>
                      <Input
                        aria-label={`Stage ${i + 1} name`}
                        value={stage.name}
                        onChange={(e) =>
                          setStages((list) =>
                            list.map((s) =>
                              s.id === stage.id ? { ...s, name: e.target.value } : s,
                            ),
                          )
                        }
                        className="h-8 flex-1"
                      />
                      <span className="w-12 shrink-0 text-right font-mono text-[11px] text-muted tabular-nums">
                        {count > 0 ? pluralise(count, 'row') : ''}
                      </span>
                      {isWin ? (
                        <span
                          className="inline-flex h-7 w-7 items-center justify-center text-won-fg"
                          title="The win"
                        >
                          <Trophy aria-label="The win" className="size-4" />
                        </span>
                      ) : (
                        <IconButton
                          aria-label={`Make ${stage.name || 'this stage'} the win`}
                          tooltip="Make this the win"
                          onClick={() => move(i, stages.length - 1)}
                        >
                          <Trophy className="size-4 text-muted" />
                        </IconButton>
                      )}
                      <IconButton
                        aria-label={`Move ${stage.name || 'stage'} up`}
                        disabled={i === 0}
                        onClick={() => move(i, i - 1)}
                      >
                        <ArrowUp className="size-4" />
                      </IconButton>
                      <IconButton
                        aria-label={`Move ${stage.name || 'stage'} down`}
                        disabled={i === stages.length - 1}
                        onClick={() => move(i, i + 1)}
                      >
                        <ArrowDown className="size-4" />
                      </IconButton>
                      <IconButton
                        aria-label={`Remove ${stage.name || 'stage'}`}
                        onClick={() => setStages((list) => list.filter((s) => s.id !== stage.id))}
                      >
                        <X className="size-4" />
                      </IconButton>
                    </li>
                  )
                })}
              </ol>
              <div className="flex items-center gap-2">
                <label htmlFor={addId} className="sr-only">
                  New stage
                </label>
                <Input
                  id={addId}
                  value={adding}
                  onChange={(e) => setAdding(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      add()
                    }
                  }}
                  placeholder="Add a stage"
                  className="h-8 flex-1"
                />
                <Button onClick={add} disabled={adding.trim() === ''}>
                  <Plus aria-hidden />
                  Add
                </Button>
              </div>
            </>
          ) : (
            <ul className="flex flex-col gap-3">
              {removedWithRows.map((stage) => (
                <li key={stage.id} className="flex flex-col gap-1.5">
                  <label htmlFor={`move-${stage.id}`} className="text-sm">
                    {pluralise(counts.get(stage.id) ?? 0, 'row')} at <strong>{stage.name}</strong>{' '}
                    go to
                  </label>
                  <select
                    id={`move-${stage.id}`}
                    value={moves[stage.id] ?? ''}
                    onChange={(e) => setMoves((m) => ({ ...m, [stage.id]: e.target.value }))}
                    className="h-8 rounded-control border border-border bg-surface-raised px-2 text-sm"
                  >
                    <option value="">No stage</option>
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            {step === 'moves' ? (
              <Button onClick={() => setStep('edit')}>Back</Button>
            ) : (
              <Button onClick={() => reset(false)}>Cancel</Button>
            )}
            <Button type="submit" variant="primary" disabled={!valid || edit.isPending}>
              {step === 'edit' && removedWithRows.length > 0 ? 'Next' : 'Save stages'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
