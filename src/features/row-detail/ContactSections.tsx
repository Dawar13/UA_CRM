/**
 * The contact essentials in an opened row: call, WhatsApp and email buttons (with a one-click
 * "log this"), logging a touch, the next action, and files. Reading works everywhere; changing
 * only on your own rows.
 */
import { Mail, MessageCircle, Paperclip, Phone, X } from 'lucide-react'
import { type FormEvent, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useActor } from '@/auth/AuthContext'
import { DateText } from '@/components/crm/DateText'
import { Button } from '@/components/ui/Button'
import { IconButton } from '@/components/ui/IconButton'
import { Input } from '@/components/ui/Input'
import {
  useAddHistory,
  useAttachFile,
  useOpenFile,
  useRemoveFile,
  useUpdateHistory,
  useUpdateRow,
} from '@/data/hooks'
import { MAX_FILE_BYTES, type NewHistoryInput } from '@/data/repository'
import { parseDateInput, parseNextAction } from '@/domain/cellInput'
import { formatFuzzyDate, istInstant, todayIst } from '@/domain/dates'
import { formatNumber } from '@/domain/format'
import type { FuzzyDate, HistoryEntry, Row, Sheet } from '@/domain/types'
import { cn } from '@/lib/cn'
import { useNow } from '@/lib/useNow'

const selectClass =
  'h-8 rounded-control border border-border bg-surface-raised px-2 text-sm text-text'

const LOG_KINDS: { kind: NewHistoryInput['kind']; label: string }[] = [
  { kind: 'note', label: 'Note' },
  { kind: 'call', label: 'Call' },
  { kind: 'meeting', label: 'Meeting' },
  { kind: 'whatsapp', label: 'WhatsApp' },
  { kind: 'email', label: 'Email' },
]

/** Digits for a wa.me link: "+91 98450 12345" → "919845012345". */
export function whatsappDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

/** The instant a touch happened: now for today, else noon IST on the day. */
function touchInstant(date: FuzzyDate, now: Date): string {
  return date.date === todayIst(now)
    ? now.toISOString()
    : istInstant(date.date, '12:00').toISOString()
}

// ---------- Call, WhatsApp, email ----------

export function ContactButtons({ row, canLog }: { row: Row; canLog: boolean }) {
  const actor = useActor()
  const log = useAddHistory()
  const offerLog = (kind: 'call' | 'whatsapp' | 'email', text: string) => {
    if (!canLog || !actor) return
    toast(`Log this ${kind === 'whatsapp' ? 'WhatsApp' : kind}?`, {
      id: 'log-touch',
      duration: 10_000,
      action: {
        label: 'Log it',
        onClick: () =>
          log.mutate(
            { row, entry: { kind, at: new Date().toISOString(), text }, actorId: actor.id },
            { onSuccess: () => toast('Logged', { id: 'log-touch' }) },
          ),
      },
    })
  }
  const phone = row.phone.trim()
  const email = row.email.trim()
  if (!phone && !email) return null
  return (
    <div className="flex items-center gap-1.5" data-testid="contact-buttons">
      {phone ? (
        <>
          <Button asChild size="sm">
            <a href={`tel:${phone}`} onClick={() => offerLog('call', 'Called')}>
              <Phone aria-hidden />
              Call
            </a>
          </Button>
          <Button asChild size="sm">
            <a
              href={`https://wa.me/${whatsappDigits(phone)}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => offerLog('whatsapp', 'Messaged on WhatsApp')}
            >
              <MessageCircle aria-hidden />
              WhatsApp
            </a>
          </Button>
        </>
      ) : null}
      {email ? (
        <Button asChild size="sm">
          <a href={`mailto:${email}`} onClick={() => offerLog('email', 'Emailed')}>
            <Mail aria-hidden />
            Email
          </a>
        </Button>
      ) : null}
    </div>
  )
}

// ---------- Logging a touch ----------

/** Kind, date (defaults to today; fuzzy or natural) and what happened. */
function TouchForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  busy,
}: {
  initial?: { kind: NewHistoryInput['kind']; date: string; text: string }
  submitLabel: string
  onSubmit: (entry: { kind: NewHistoryInput['kind']; date: FuzzyDate; text: string }) => void
  onCancel?: () => void
  busy: boolean
}) {
  const now = useNow()
  const [kind, setKind] = useState<NewHistoryInput['kind']>(initial?.kind ?? 'note')
  const [date, setDate] = useState(initial?.date ?? '')
  const [text, setText] = useState(initial?.text ?? '')
  const kindId = useId()
  const dateId = useId()
  const textId = useId()
  const parsed =
    date.trim() === ''
      ? { date: todayIst(now), precision: 'day' as const }
      : parseDateInput(date, now)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!parsed || text.trim() === '') return
    onSubmit({ kind, date: parsed, text })
    if (!initial) {
      setText('')
      setDate('')
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5" aria-label={submitLabel}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={kindId} className="sr-only">
          Kind
        </label>
        <select
          id={kindId}
          value={kind}
          onChange={(e) => setKind(e.target.value as NewHistoryInput['kind'])}
          className={cn(selectClass, 'w-[108px]')}
        >
          {LOG_KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
        <label htmlFor={dateId} className="sr-only">
          When
        </label>
        <Input
          id={dateId}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          placeholder="Today"
          aria-invalid={parsed ? undefined : true}
          className="h-8 w-[118px]"
        />
        <label htmlFor={textId} className="sr-only">
          What happened
        </label>
        <Input
          id={textId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What happened"
          className="h-8 min-w-0 flex-1"
        />
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={!parsed || !text.trim() || busy}
        >
          {submitLabel}
        </Button>
        {onCancel ? <Button onClick={onCancel}>Cancel</Button> : null}
      </div>
      {date.trim() && !parsed ? (
        <p className="text-xs text-cold">Type a date, like 12 Nov, mid Oct or yesterday</p>
      ) : date.trim() && parsed ? (
        <p className="font-mono text-xs text-secondary">{formatFuzzyDate(parsed, now)}</p>
      ) : null}
    </form>
  )
}

export function LogTouch({ row }: { row: Row }) {
  const actor = useActor()
  const add = useAddHistory()
  const now = useNow()
  if (!actor) return null
  return (
    <TouchForm
      submitLabel="Log"
      busy={add.isPending}
      onSubmit={({ kind, date, text }) =>
        add.mutate({
          row,
          entry: {
            kind,
            at: touchInstant(date, now),
            fuzzyDate: date.date === todayIst(now) ? null : date,
            text,
          },
          actorId: actor.id,
        })
      }
    />
  )
}

export function EditTouch({
  row,
  entry,
  onDone,
}: {
  row: Row
  entry: HistoryEntry
  onDone: () => void
}) {
  const actor = useActor()
  const update = useUpdateHistory()
  const now = useNow()
  if (!actor) return null
  const date = entry.fuzzyDate ?? { date: todayIst(new Date(entry.at)), precision: 'day' as const }
  return (
    <TouchForm
      initial={{
        kind: entry.kind as NewHistoryInput['kind'],
        date: formatFuzzyDate(date, now),
        text: entry.text,
      }}
      submitLabel="Save"
      busy={update.isPending}
      onCancel={onDone}
      onSubmit={(next) => {
        update.mutate(
          {
            row,
            entry,
            patch: {
              kind: next.kind,
              at: touchInstant(next.date, now),
              fuzzyDate: next.date.date === todayIst(now) ? null : next.date,
              text: next.text,
            },
            actorId: actor.id,
          },
          { onSuccess: onDone },
        )
      }}
    />
  )
}

// ---------- Next action ----------

export function NextActionField({
  row,
  sheet,
  editable,
}: {
  row: Row
  sheet: Sheet
  editable: boolean
}) {
  const actor = useActor()
  const update = useUpdateRow()
  const now = useNow()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState('')
  const next =
    row.nextAction && (row.nextAction.text || row.nextAction.date) ? row.nextAction : null
  const preview = text.trim() ? parseNextAction(text, now) : null

  const save = () => {
    setEditing(false)
    if (!actor) return
    const value = text.trim() ? parseNextAction(text, now) : null
    update.mutate({
      row,
      sheet,
      patch: { nextAction: value },
      actorId: actor.id,
      label: 'Edit Next action',
    })
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1">
        <Input
          autoFocus
          aria-label="Next action"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              save()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setEditing(false)
            }
          }}
          placeholder="fri 4pm send ROI note"
          className="h-8"
        />
        {preview?.date ? (
          <p className="font-mono text-xs text-secondary">
            {formatFuzzyDate(preview.date, now)}
            {preview.text ? ` · ${preview.text}` : ''}
          </p>
        ) : null}
      </div>
    )
  }

  const shown = next ? (
    <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-base text-text">
      {next.date ? (
        <DateText date={next.date} variant="due" className="font-mono text-xs font-medium" />
      ) : null}
      <span>{next.text}</span>
    </p>
  ) : (
    <p className="text-[13.5px] text-muted">
      {editable ? 'None set. Click to add one.' : 'None set'}
    </p>
  )
  if (!editable) return shown
  return (
    <button
      type="button"
      onClick={() => {
        setText(
          next
            ? [next.date ? formatFuzzyDate(next.date, now) : '', next.text]
                .filter(Boolean)
                .join(' ')
            : '',
        )
        setEditing(true)
      }}
      className="-mx-1.5 rounded-control px-1.5 py-0.5 text-left hover:bg-surface-hover"
      data-testid="edit-next-action"
    >
      {shown}
    </button>
  )
}

// ---------- Files ----------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${formatNumber(Math.round(bytes / 1024))} KB`
  return `${formatNumber(Math.round((bytes / (1024 * 1024)) * 10) / 10)} MB`
}

export function FilesSection({ row, editable }: { row: Row; editable: boolean }) {
  const actor = useActor()
  const attach = useAttachFile()
  const remove = useRemoveFile()
  const open = useOpenFile()
  const input = useRef<HTMLInputElement>(null)
  if (row.files.length === 0 && !editable) return null

  const onFiles = (files: FileList | null) => {
    if (!files || !actor) return
    for (const file of Array.from(files)) {
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} is larger than 10 MB`, { id: 'attach' })
        continue
      }
      attach.mutate({
        row,
        file: { name: file.name, type: file.type, size: file.size, data: file },
        actorId: actor.id,
      })
    }
  }

  return (
    <div className="flex flex-col gap-1.5" data-testid="files">
      {row.files.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {row.files.map((file) => (
            <li
              key={file.id}
              className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-control bg-bg pr-1 pl-2 text-sm shadow-[inset_0_0_0_1px_var(--border)]"
            >
              <button
                type="button"
                onClick={() => void open(file)}
                className="flex min-w-0 items-center gap-1.5 hover:underline"
              >
                <Paperclip aria-hidden className="size-3.5 shrink-0 text-muted" />
                <span className="truncate">{file.name}</span>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {formatSize(file.size)}
                </span>
              </button>
              {editable && actor ? (
                <IconButton
                  aria-label={`Remove ${file.name}`}
                  tooltip="Remove"
                  onClick={() => remove.mutate({ row, file, actorId: actor.id })}
                >
                  <X className="size-3.5" />
                </IconButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {editable ? (
        <div>
          <input
            ref={input}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              onFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => input.current?.click()}
            disabled={attach.isPending}
          >
            <Paperclip aria-hidden />
            {attach.isPending ? 'Attaching…' : 'Attach a file'}
          </Button>
          <span className="ml-1 text-xs text-muted">Up to 10 MB</span>
        </div>
      ) : null}
    </div>
  )
}
