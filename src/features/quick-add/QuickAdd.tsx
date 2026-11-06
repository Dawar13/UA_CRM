/**
 * Quick add (CLAUDE.md §2.6), at the top of your own sheet. Press / or click it, type a contact
 * in the quick-add language, press Enter to see every field it read (coloured by how sure the
 * parser is, with any possible duplicates), and Enter again to save. Esc goes back to editing.
 * A line starting with > logs a touch on the selected row instead. The draft is kept in the
 * browser until it is saved.
 */
import { useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useUiStore } from '@/app/uiStore'
import { useActor } from '@/auth/AuthContext'
import { Button } from '@/components/ui/Button'
import { Kbd } from '@/components/ui/Kbd'
import { usePeople, useRows, useTags } from '@/data/hooks'
import { saveErrorMessage } from '@/data/hooks/rowEdits'
import { useRepository } from '@/data/RepositoryContext'
import type { DuplicateCandidate, MutationContext } from '@/data/repository'
import { mergeIntoRow } from '@/domain/dedupe/merge'
import { pluralise } from '@/domain/format'
import {
  type Confidence,
  type ParsedContact,
  type PreviewField,
  parseQuickAdd,
  type QuickAddResult,
} from '@/domain/quickadd/parse'
import type { Member, Row, Sheet } from '@/domain/types'
import { readStorage, STORAGE_PREFIX, writeStorage } from '@/lib/storage'
import { useUndoStack } from '@/lib/undoStack'
import { type DuplicateChoice, DuplicateChoices } from './DuplicateChoices'

const draftKey = (sheetId: string) => `${STORAGE_PREFIX}quick-add:${sheetId}`

const PLACEHOLDER = [
  'Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur',
  'why: 4 heading lines  +91 98450 12345  rohan@hpf.in',
  'via: Krithik  #warm #foundry  stage: first call',
  'next: fri 4pm send ROI note',
].join('\n')

const confidenceClass: Record<Confidence, string> = {
  high: 'text-text',
  medium: 'rounded-chip bg-waiting-bg px-1 text-waiting',
  low: 'rounded-chip bg-cold-bg px-1 text-cold',
}

function Fields({ fields }: { fields: readonly PreviewField[] }) {
  return (
    <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1">
      {fields.map((f) => (
        <div key={f.key} className="contents" data-confidence={f.confidence}>
          <dt className="text-xs text-muted">{f.label}</dt>
          <dd className="min-w-0 text-sm whitespace-pre-line break-words">
            <span className={confidenceClass[f.confidence]}>{f.display}</span>
          </dd>
        </div>
      ))}
    </dl>
  )
}

type Checks = Record<number, { loading: boolean; candidates: DuplicateCandidate[] }>
type Choices = Record<number, { candidate: DuplicateCandidate; choice: DuplicateChoice }>

export function QuickAdd({
  member,
  sheet,
  selectedRowId,
}: {
  member: Member
  sheet: Sheet
  /** The opened or active row, for `>` touches. */
  selectedRowId: string | null
}) {
  const actor = useActor()
  const repo = useRepository()
  const qc = useQueryClient()
  const { data: tags = [] } = useTags()
  const { data: people = [] } = usePeople()
  const { data: rows = [] } = useRows(sheet.id)
  const quickAddRequest = useUiStore((s) => s.quickAddRequest)
  const quickAddPaste = useUiStore((s) => s.quickAddPaste)
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'edit' | 'preview'>('edit')
  const [text, setText] = useState(() => readStorage(draftKey(sheet.id)) ?? '')
  const [result, setResult] = useState<QuickAddResult | null>(null)
  const [checks, setChecks] = useState<Checks>({})
  const [choices, setChoices] = useState<Choices>({})
  const [saving, setSaving] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const previewRef = useRef<HTMLButtonElement>(null)
  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedRowId) ?? null,
    [rows, selectedRowId],
  )

  // The draft is kept until it is saved.
  useEffect(() => writeStorage(draftKey(sheet.id), text || null), [sheet.id, text])

  const focusEditor = () => {
    setOpen(true)
    setMode('edit')
    requestAnimationFrame(() => textRef.current?.focus())
  }

  const preview = (value: string) => {
    if (!value.trim()) return
    const parsed = parseQuickAdd(value, { now: new Date(), sheet, tags, people })
    setResult(parsed)
    setChoices({})
    setMode('preview')
    requestAnimationFrame(() => previewRef.current?.focus())
    if (parsed.kind !== 'contacts') return
    const initial: Checks = {}
    parsed.contacts.forEach((_, i) => {
      initial[i] = { loading: true, candidates: [] }
    })
    setChecks(initial)
    parsed.contacts.forEach((contact, i) => {
      const v = contact.values
      if (!v.name) {
        setChecks((c) => ({ ...c, [i]: { loading: false, candidates: [] } }))
        return
      }
      repo
        .findDuplicates({
          name: v.name,
          phone: v.phone,
          email: v.email,
          linkedin: v.linkedin,
          company: v.company,
        })
        .then(
          (candidates) =>
            setChecks((c) => ({
              ...c,
              [i]: { loading: false, candidates: candidates.slice(0, 3) },
            })),
          () => setChecks((c) => ({ ...c, [i]: { loading: false, candidates: [] } })),
        )
    })
  }

  // The latest handlers, for effects that run only when a request arrives.
  const latest = useRef({ focusEditor, preview })
  latest.current = { focusEditor, preview }

  // The / key.
  const firstRequest = useRef(quickAddRequest)
  useEffect(() => {
    if (quickAddRequest !== firstRequest.current) latest.current.focusEditor()
  }, [quickAddRequest])

  // Smart paste: a signature or profile pasted into the grid.
  const firstPaste = useRef(quickAddPaste?.n ?? 0)
  useEffect(() => {
    if (!quickAddPaste || quickAddPaste.n === firstPaste.current) return
    firstPaste.current = quickAddPaste.n
    setOpen(true)
    setText(quickAddPaste.text)
    latest.current.preview(quickAddPaste.text)
  }, [quickAddPaste])

  const checking = result?.kind === 'contacts' && result.contacts.some((_, i) => checks[i]?.loading)
  const blocked =
    result?.kind === 'contacts' &&
    result.contacts.some(
      (c, i) =>
        !c.values.name || (checks[i]?.candidates.some((d) => d.level === 'hard') && !choices[i]),
    )
  // Save pressed while the duplicate check runs: save when it is done (if nothing blocks).
  const [pending, setPending] = useState(false)
  const touchBlocked = result?.kind === 'touch' && !selectedRow

  const ctx = (): MutationContext => ({ actorId: actor?.id ?? member.id, now: new Date() })

  const saveContact = async (contact: ParsedContact, index: number) => {
    const tagIds = [...(contact.values.tagIds ?? [])]
    for (const name of contact.newTags) {
      const tag = await repo.createTag({ name }, ctx())
      if (!tagIds.includes(tag.id)) tagIds.push(tag.id)
    }
    const values = { ...contact.values, ...(tagIds.length > 0 ? { tagIds } : {}) }
    const decision = choices[index]
    if (decision?.choice === 'merge') {
      const target = decision.candidate.location.row
      const { patch, conflicts } = mergeIntoRow(target, values)
      if (Object.keys(patch).length > 0) await repo.updateRow(target.id, patch, ctx())
      if (conflicts.length > 0) {
        toast(
          `Merged into ${target.name}. Kept its own ${conflicts.map((c) => c.label.toLowerCase()).join(', ')}.`,
        )
      }
      return { kind: 'merged' as const, row: target, patch }
    }
    const created = await repo.createRow(
      {
        sheetId: sheet.id,
        values:
          decision?.choice === 'link'
            ? { ...values, samePerson: [decision.candidate.location.row.id] }
            : values,
      },
      ctx(),
    )
    if (decision?.choice === 'different') {
      await repo.markNotDuplicate(created.row.id, decision.candidate.location.row.id, ctx())
    }
    return { kind: 'created' as const, row: created.row }
  }

  const commit = async () => {
    if (!result || saving || !actor) return
    if (checking) {
      setPending(true)
      return
    }
    setPending(false)
    setSaving(true)
    try {
      if (result.kind === 'touch') {
        if (!selectedRow) return
        const touch = result.touch
        await repo.addHistory(
          selectedRow.id,
          { kind: touch.kind, at: new Date().toISOString(), text: touch.text },
          ctx(),
        )
        if (touch.nextAction) {
          await repo.updateRow(selectedRow.id, { nextAction: touch.nextAction }, ctx())
        }
        toast(`Logged on ${selectedRow.name}`)
      } else {
        const done: Awaited<ReturnType<typeof saveContact>>[] = []
        for (const [i, contact] of result.contacts.entries())
          done.push(await saveContact(contact, i))
        const created = done.filter((d) => d.kind === 'created').map((d) => d.row as Row)
        useUndoStack.getState().push({
          label:
            created.length === 1
              ? `Add ${created[0]?.name}`
              : `Add ${pluralise(created.length, 'contact')}`,
          undo: async () => {
            if (created.length > 0)
              await repo.deleteRows(
                created.map((r) => r.id),
                ctx(),
              )
            await qc.invalidateQueries()
          },
          redo: async () => {
            if (created.length > 0)
              await repo.restoreRows(
                created.map((r) => r.id),
                ctx(),
              )
            await qc.invalidateQueries()
          },
        })
        toast(
          created.length === 1
            ? `Added ${created[0]?.name}`
            : created.length > 1
              ? `Added ${pluralise(created.length, 'contact')}`
              : 'Merged',
        )
      }
      setText('')
      setResult(null)
      setMode('edit')
      setOpen(false)
      await qc.invalidateQueries()
    } catch (error) {
      toast.error(saveErrorMessage(error), { id: 'quick-add' })
    } finally {
      setSaving(false)
    }
  }

  const latestCommit = useRef(commit)
  latestCommit.current = commit
  useEffect(() => {
    if (!pending || checking) return
    if (blocked) setPending(false)
    else void latestCommit.current()
  }, [pending, checking, blocked])

  const onEditorKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      preview(text)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  /** Esc on the preview's buttons goes back to editing (Enter on Save saves). */
  const onPreviewKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      focusEditor()
    }
  }

  if (!open) {
    return (
      <div
        className="shrink-0 border-b border-grid-line bg-surface-subtle px-3 py-1.5"
        data-testid="quick-add"
      >
        <button
          type="button"
          onClick={focusEditor}
          className="flex h-7 w-full min-w-0 items-center gap-2 rounded-control px-1.5 text-left text-sm text-muted hover:bg-surface-hover hover:text-secondary"
        >
          <ChevronRight aria-hidden className="size-4 shrink-0" />
          <span className="truncate">
            {text
              ? 'Quick add: draft kept. Press / to carry on.'
              : 'Quick add: Name / Title @ Company, Location'}
          </span>
          <Kbd keys={['/']} className="ml-auto" />
        </button>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 border-b border-grid-line bg-surface-subtle px-3 py-2.5"
      data-testid="quick-add"
    >
      {mode === 'edit' ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            ref={textRef}
            aria-label="Quick add"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onEditorKey}
            placeholder={PLACEHOLDER}
            rows={Math.min(8, Math.max(2, text.split('\n').length + 1))}
            spellCheck={false}
            className="w-full resize-none rounded-control border border-border bg-surface-raised px-2.5 py-2 font-mono text-[13px] leading-[1.55] text-text outline-none placeholder:text-muted focus-visible:border-focus"
          />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>
              <Kbd keys={['Enter']} /> preview
            </span>
            <span>
              <Kbd keys={['Shift', 'Enter']} /> new line
            </span>
            <span>A blank line starts the next contact</span>
            <span>&gt; logs a touch on the selected row</span>
            <span>
              <Kbd keys={['Esc']} /> close (the draft is kept)
            </span>
          </p>
        </div>
      ) : (
        <section
          aria-label="Quick add preview"
          className="flex flex-col gap-3"
          data-testid="quick-add-preview"
        >
          {result?.kind === 'touch' ? (
            <div className="rounded-card border border-border bg-surface-raised p-3 shadow-card">
              <p className="mb-2 text-sm font-medium">
                {selectedRow
                  ? `Log on ${selectedRow.name}`
                  : 'Pick a row first: click it or open it, then type > again.'}
              </p>
              <Fields fields={result.touch.preview} />
            </div>
          ) : result?.kind === 'contacts' ? (
            result.contacts.map((contact, i) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: contacts are in the order typed.
                key={i}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface-raised p-3 shadow-card"
                data-testid="quick-add-contact"
              >
                <Fields fields={contact.preview} />
                {contact.warnings.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 text-xs text-cold">
                    {contact.warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}
                {checks[i]?.loading ? (
                  <p className="text-xs text-muted">Checking for duplicates…</p>
                ) : (
                  checks[i]?.candidates.map((candidate) => (
                    <DuplicateChoices
                      key={candidate.location.row.id}
                      candidate={candidate}
                      actorId={actor?.id ?? ''}
                      choice={
                        choices[i]?.candidate.location.row.id === candidate.location.row.id
                          ? choices[i]?.choice
                          : undefined
                      }
                      onChoose={(choice) =>
                        setChoices((c) => ({ ...c, [i]: { candidate, choice } }))
                      }
                    />
                  ))
                )}
              </div>
            ))
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              ref={previewRef}
              variant="primary"
              disabled={Boolean(blocked) || touchBlocked || saving}
              aria-busy={checking || undefined}
              onClick={() => void commit()}
              onKeyDown={onPreviewKey}
            >
              {saving ? 'Saving…' : result?.kind === 'touch' ? 'Log it' : 'Save'}
              <Kbd keys={['Enter']} className="ml-1" />
            </Button>
            <Button onClick={focusEditor} onKeyDown={onPreviewKey}>
              Edit <Kbd keys={['Esc']} className="ml-1" />
            </Button>
            {blocked && result?.kind === 'contacts' ? (
              <span className="text-xs text-cold">
                {result.contacts.some((c) => !c.values.name)
                  ? 'Every contact needs a name.'
                  : 'Choose what to do about each same phone, email or LinkedIn first.'}
              </span>
            ) : null}
            <span className="ml-auto text-xs text-muted">
              Plain: sure · ochre: likely · brick: check it
            </span>
          </div>
        </section>
      )}
    </div>
  )
}
