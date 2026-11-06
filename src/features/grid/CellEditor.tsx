/**
 * Editing a cell in place. The editor floats over the cell (in a portal, so it is never clipped by
 * the row) and follows it while the grid scrolls. Enter or Tab commits, Esc cancels, a click
 * outside commits. Each column type gets the editor that fits it:
 *
 * - text: one line, with what it reads as underneath ("₹25 L", "Mid Nov", "+91 98450 12345");
 * - long text: a few lines, Shift+Enter for a new line;
 * - choice (dropdown, warmth, stage) and multi-choice: type to filter, arrows, Enter;
 * - tags: type to filter, or Enter to create a tag that does not exist yet;
 * - person (introduced by, person link) and people (connects to): search every tab, or keep the
 *   text as written for someone not in the CRM yet.
 */
import { Check, Plus, X } from 'lucide-react'
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { TagChip } from '@/components/crm/TagChip'
import { useCreateTag, useSearch, useTags } from '@/data/hooks'
import {
  type CellTextContext,
  cellEditText,
  cellPatch,
  editorKind,
  parseTextCell,
} from '@/domain/cellInput'
import type { RowPatch } from '@/domain/rows'
import type { ColumnDef, Id, LinkRef, Row, Sheet, Tag, Warmth } from '@/domain/types'
import { cn } from '@/lib/cn'
import { LinkedRowName } from './cells'

export type EditOutcome =
  | { kind: 'patch'; patch: RowPatch; label: string }
  | { kind: 'warmth'; warmth: Warmth | null }
  | { kind: 'stage'; index: number }
  | { kind: 'none' }

export type EditMove = 'stay' | 'down' | 'right' | 'left'

export interface CellEditorProps {
  anchor: HTMLElement
  def: ColumnDef
  row: Row
  sheet: Sheet
  /** The key that started the edit (it replaces the value), or null to edit the value. */
  initial: string | null
  ctx: CellTextContext
  /** The signed-in member, who creates any new tags. */
  actorId: Id
  onDone: (outcome: EditOutcome, move: EditMove) => void
  onCancel: () => void
}

/** The cell's place on screen, kept current while anything scrolls. */
function useAnchorRect(anchor: HTMLElement): DOMRect {
  const [rect, setRect] = useState(() => anchor.getBoundingClientRect())
  useLayoutEffect(() => {
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setRect(anchor.getBoundingClientRect()))
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [anchor])
  return rect
}

const surface =
  'rounded-control bg-surface-raised text-text shadow-popover ring-2 ring-focus outline-none'
const optionClass = cn(
  'flex h-8 w-full cursor-default select-none items-center gap-2 rounded-control px-2 text-left text-sm text-text',
  'data-[highlighted=true]:bg-surface-hover',
)
const hintClass = 'px-2.5 py-1.5 text-xs'

export function CellEditor(props: CellEditorProps) {
  const rect = useAnchorRect(props.anchor)
  const commitRef = useRef<() => void>(() => props.onCancel())
  const kind = editorKind(props.def)

  let body: ReactNode = null
  switch (kind) {
    case 'text':
      body = <TextEditor {...props} commitRef={commitRef} />
      break
    case 'longText':
      body = <TextEditor {...props} commitRef={commitRef} multiline />
      break
    case 'choice':
      body = <ChoiceEditor {...props} commitRef={commitRef} />
      break
    case 'multiChoice':
      body = <MultiChoiceEditor {...props} commitRef={commitRef} />
      break
    case 'tags':
      body = <TagsEditor {...props} commitRef={commitRef} />
      break
    case 'person':
    case 'people':
      body = <PeopleEditor {...props} commitRef={commitRef} multiple={kind === 'people'} />
      break
    default:
      return null
  }

  const below = window.innerHeight - rect.top > 280
  return createPortal(
    <>
      {/* A click anywhere else commits, as in a spreadsheet. */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40"
        onMouseDown={(event) => {
          event.preventDefault()
          commitRef.current()
        }}
      />
      <div
        data-testid="cell-editor"
        className="fixed z-50"
        style={{
          left: Math.max(4, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 260) - 4)),
          ...(below ? { top: rect.top } : { bottom: window.innerHeight - rect.bottom }),
          minWidth: Math.max(rect.width, kind === 'text' ? rect.width : 260),
        }}
      >
        {body}
      </div>
    </>,
    document.body,
  )
}

interface EditorProps extends CellEditorProps {
  commitRef: { current: () => void }
}

function moveFor(event: KeyboardEvent): EditMove {
  return event.shiftKey ? 'left' : 'right'
}

// ---------- One line or a few ----------

function TextEditor({
  def,
  row,
  initial,
  ctx,
  onDone,
  onCancel,
  commitRef,
  anchor,
  multiline = false,
}: EditorProps & { multiline?: boolean }) {
  const start = initial ?? cellEditText(def, row, ctx)
  const [text, setText] = useState(start)
  const [error, setError] = useState<string | null>(null)
  const done = useRef(false)
  const parsed = useMemo(() => parseTextCell(def, text, ctx.now), [def, text, ctx.now])

  const commit = (move: EditMove) => {
    if (done.current) return
    if (initial === null && text === start) {
      done.current = true
      onDone({ kind: 'none' }, move)
      return
    }
    const result = parseTextCell(def, text, ctx.now)
    if (!result.ok) {
      setError(result.message)
      return
    }
    done.current = true
    onDone(
      { kind: 'patch', patch: cellPatch(def, row, result.value), label: `Edit ${def.label}` },
      move,
    )
  }
  commitRef.current = () => commit('stay')

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      done.current = true
      onCancel()
    } else if (event.key === 'Tab') {
      event.preventDefault()
      commit(moveFor(event))
    } else if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault()
      commit(multiline ? 'stay' : 'down')
    }
  }

  const fieldClass = cn(
    surface,
    'block w-full px-2.5 text-sm placeholder:text-muted',
    multiline ? 'min-h-[104px] resize-y py-2 leading-[1.5]' : '',
  )
  const height = anchor.getBoundingClientRect().height
  const hint = error ? (
    <p role="alert" className={cn(hintClass, 'text-cold')}>
      {error}
    </p>
  ) : parsed.ok && parsed.preview ? (
    <p className={cn(hintClass, 'font-mono text-secondary')}>{parsed.preview}</p>
  ) : null

  return (
    <div className="flex flex-col">
      {multiline ? (
        <textarea
          // biome-ignore lint/a11y/noAutofocus: the editor opens for typing.
          autoFocus
          aria-label={def.label}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          onFocus={(e) =>
            e.currentTarget.setSelectionRange(
              e.currentTarget.value.length,
              e.currentTarget.value.length,
            )
          }
          className={cn(fieldClass, 'w-[320px]')}
        />
      ) : (
        <input
          // biome-ignore lint/a11y/noAutofocus: the editor opens for typing.
          autoFocus
          aria-label={def.label}
          aria-invalid={error ? true : undefined}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          onKeyDown={onKeyDown}
          onFocus={(e) =>
            e.currentTarget.setSelectionRange(
              e.currentTarget.value.length,
              e.currentTarget.value.length,
            )
          }
          className={fieldClass}
          style={{ height }}
          spellCheck={false}
          autoComplete="off"
        />
      )}
      {hint ? (
        <div className="mt-1 rounded-control border border-border bg-surface-raised shadow-popover">
          {hint}
        </div>
      ) : null}
    </div>
  )
}

// ---------- Lists ----------

interface Option<T> {
  key: string
  label: string
  value: T
  render?: ReactNode
}

/** A filter input over a list: arrows move, Enter picks, Esc cancels. */
function OptionList<T>({
  label,
  query,
  onQuery,
  options,
  selected,
  onPick,
  onCommit,
  onCancel,
  footer,
}: {
  label: string
  query: string
  onQuery: (q: string) => void
  options: readonly Option<T>[]
  selected?: ReadonlySet<string>
  onPick: (option: Option<T>) => void
  onCommit: (move: EditMove) => void
  onCancel: () => void
  footer?: ReactNode
}) {
  const [active, setActive] = useState(0)
  const listId = `cell-editor-list-${label.replace(/\W+/g, '-')}`
  const current = options[Math.min(active, options.length - 1)]

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        setActive((a) => Math.min(a + 1, options.length - 1))
        break
      case 'ArrowUp':
        event.preventDefault()
        setActive((a) => Math.max(a - 1, 0))
        break
      case 'Enter':
        event.preventDefault()
        if (current) onPick(current)
        else onCommit('stay')
        break
      case 'Tab':
        event.preventDefault()
        onCommit(moveFor(event))
        break
      case 'Escape':
        event.preventDefault()
        onCancel()
        break
    }
  }

  return (
    <div className={cn(surface, 'flex w-[280px] flex-col p-1')}>
      <input
        // biome-ignore lint/a11y/noAutofocus: the editor opens for typing.
        autoFocus
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={current ? `${listId}-${current.key}` : undefined}
        value={query}
        onChange={(e) => {
          onQuery(e.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
        placeholder="Type to filter"
        spellCheck={false}
        autoComplete="off"
        className="h-8 w-full rounded-control bg-transparent px-2 text-sm outline-none placeholder:text-muted"
      />
      <div className="my-1 h-px bg-border" />
      <div id={listId} role="listbox" aria-label={label} className="max-h-64 overflow-y-auto">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted">No matches</p>
        ) : (
          options.map((option, i) => (
            <div
              key={option.key}
              id={`${listId}-${option.key}`}
              role="option"
              tabIndex={-1}
              aria-selected={selected ? selected.has(option.key) : i === active}
              data-highlighted={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                onPick(option)
              }}
              className={optionClass}
            >
              {selected ? (
                <Check
                  aria-hidden
                  className={cn(
                    'size-3.5 shrink-0',
                    selected.has(option.key) ? 'text-link' : 'invisible',
                  )}
                />
              ) : null}
              {option.render ?? <span className="truncate">{option.label}</span>}
            </div>
          ))
        )}
      </div>
      {footer}
    </div>
  )
}

function filterOptions<T>(options: readonly Option<T>[], query: string): Option<T>[] {
  const q = query.trim().toLowerCase()
  if (!q) return [...options]
  const starts = options.filter((o) => o.label.toLowerCase().startsWith(q))
  const contains = options.filter(
    (o) => !o.label.toLowerCase().startsWith(q) && o.label.toLowerCase().includes(q),
  )
  return [...starts, ...contains]
}

function ChoiceEditor({ def, row, sheet, initial, onDone, onCancel, commitRef }: EditorProps) {
  const [query, setQuery] = useState(initial ?? '')
  commitRef.current = () => onDone({ kind: 'none' }, 'stay')

  type Choice =
    | { kind: 'warmth'; warmth: Warmth | null }
    | { kind: 'stage'; index: number }
    | { kind: 'value'; value: string | null }
  let options: Option<Choice>[]
  if (def.system && def.key === 'warmth') {
    options = [
      { key: 'warm', label: 'Warm', value: { kind: 'warmth', warmth: 'warm' } },
      { key: 'waiting', label: 'Waiting', value: { kind: 'warmth', warmth: 'waiting' } },
      { key: 'cold', label: 'Cold', value: { kind: 'warmth', warmth: 'cold' } },
      ...(row.warmth
        ? [{ key: 'none', label: 'Clear', value: { kind: 'warmth' as const, warmth: null } }]
        : []),
    ]
  } else if (def.system && def.key === 'stage') {
    options = sheet.stages.map((s, index) => ({
      key: s.id,
      label: s.name,
      value: { kind: 'stage', index },
    }))
  } else {
    const current = row.fields[def.key]
    options = [
      ...(def.options ?? []).map((o) => ({
        key: o,
        label: o,
        value: { kind: 'value' as const, value: o },
      })),
      ...(current
        ? [{ key: '__clear', label: 'Clear', value: { kind: 'value' as const, value: null } }]
        : []),
    ]
  }

  const pick = (option: Option<Choice>) => {
    const choice = option.value
    if (choice.kind === 'warmth') onDone({ kind: 'warmth', warmth: choice.warmth }, 'stay')
    else if (choice.kind === 'stage') onDone({ kind: 'stage', index: choice.index }, 'stay')
    else
      onDone(
        { kind: 'patch', patch: cellPatch(def, row, choice.value), label: `Edit ${def.label}` },
        'stay',
      )
  }

  return (
    <OptionList
      label={def.label}
      query={query}
      onQuery={setQuery}
      options={filterOptions(options, query)}
      onPick={pick}
      onCommit={(move) => onDone({ kind: 'none' }, move)}
      onCancel={onCancel}
    />
  )
}

function MultiChoiceEditor({ def, row, initial, onDone, onCancel, commitRef }: EditorProps) {
  const start = Array.isArray(row.fields[def.key]) ? (row.fields[def.key] as string[]) : []
  const [picked, setPicked] = useState<string[]>(start)
  const [query, setQuery] = useState(initial ?? '')
  const commit = (move: EditMove) => {
    const same = picked.length === start.length && picked.every((p) => start.includes(p))
    onDone(
      same
        ? { kind: 'none' }
        : { kind: 'patch', patch: cellPatch(def, row, picked), label: `Edit ${def.label}` },
      move,
    )
  }
  commitRef.current = () => commit('stay')
  const options = (def.options ?? []).map((o) => ({ key: o, label: o, value: o }))
  return (
    <OptionList
      label={def.label}
      query={query}
      onQuery={setQuery}
      options={filterOptions(options, query)}
      selected={new Set(picked)}
      onPick={(option) =>
        setPicked((p) =>
          p.includes(option.value) ? p.filter((x) => x !== option.value) : [...p, option.value],
        )
      }
      onCommit={commit}
      onCancel={onCancel}
      footer={<EditorFooter onDone={() => commit('stay')} />}
    />
  )
}

function EditorFooter({ onDone }: { onDone: () => void }) {
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border px-1 pt-1">
      <span className="px-1 text-xs text-muted">Enter picks · Tab saves</span>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          onDone()
        }}
        className="h-7 rounded-control px-2 text-sm font-medium text-link hover:bg-surface-hover"
      >
        Done
      </button>
    </div>
  )
}

function TagsEditor({ def, row, initial, actorId, onDone, onCancel, commitRef }: EditorProps) {
  const { data: tags = [] } = useTags()
  const createTag = useCreateTag()
  const [picked, setPicked] = useState<Id[]>(row.tagIds)
  const [query, setQuery] = useState(initial ?? '')
  const commit = (move: EditMove) => {
    const same = picked.length === row.tagIds.length && picked.every((p, i) => row.tagIds[i] === p)
    onDone(
      same
        ? { kind: 'none' }
        : { kind: 'patch', patch: cellPatch(def, row, picked), label: 'Edit Tags' },
      move,
    )
  }
  commitRef.current = () => commit('stay')

  const name = query.trim().replace(/^#+/, '')
  const exists = tags.some((t) => t.name.toLowerCase() === name.toLowerCase())
  type TagOption = { kind: 'tag'; tag: Tag } | { kind: 'create'; name: string }
  const options: Option<TagOption>[] = filterOptions(
    tags.map((tag) => ({
      key: tag.id,
      label: tag.name,
      value: { kind: 'tag' as const, tag },
      render: <TagChip name={tag.name} colour={tag.colour} />,
    })),
    name,
  )
  if (name && !exists) {
    options.push({
      key: '__create',
      label: name,
      value: { kind: 'create', name },
      render: (
        <span className="flex min-w-0 items-center gap-1.5">
          <Plus aria-hidden className="size-3.5 shrink-0 text-secondary" />
          <span className="truncate">Create #{name}</span>
        </span>
      ),
    })
  }

  const pick = async (option: Option<TagOption>) => {
    if (option.value.kind === 'tag') {
      const id = option.value.tag.id
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))
      return
    }
    const tag = await createTag.mutateAsync({ name: option.value.name, actorId })
    setPicked((p) => (p.includes(tag.id) ? p : [...p, tag.id]))
    setQuery('')
  }

  return (
    <OptionList
      label="Tags"
      query={query}
      onQuery={setQuery}
      options={options}
      selected={new Set(picked)}
      onPick={(option) => void pick(option)}
      onCommit={commit}
      onCancel={onCancel}
      footer={<EditorFooter onDone={() => commit('stay')} />}
    />
  )
}

function linkKey(link: LinkRef): string {
  return link.kind === 'row' ? `row:${link.rowId}` : `text:${link.text}`
}

function PeopleEditor({
  def,
  row,
  initial,
  onDone,
  onCancel,
  commitRef,
  multiple,
}: EditorProps & { multiple: boolean }) {
  const startLinks: LinkRef[] = useMemo(() => {
    if (def.system && def.key === 'connectsTo') return row.connectsTo
    const value = def.system ? row.introducedBy : row.fields[def.key]
    return value && typeof value === 'object' && 'kind' in value ? [value as LinkRef] : []
  }, [def, row])
  const [links, setLinks] = useState<LinkRef[]>(startLinks)
  const [query, setQuery] = useState(initial ?? '')
  const { data: results = [] } = useSearch(query)

  const finish = (next: LinkRef[], move: EditMove) => {
    const same =
      next.length === startLinks.length &&
      next.every((l, i) => startLinks[i] && linkKey(l) === linkKey(startLinks[i] as LinkRef))
    if (same) {
      onDone({ kind: 'none' }, move)
      return
    }
    const value = multiple ? next : (next[0] ?? null)
    onDone({ kind: 'patch', patch: cellPatch(def, row, value), label: `Edit ${def.label}` }, move)
  }
  commitRef.current = () => finish(links, 'stay')

  type PersonOption = { kind: 'link'; link: LinkRef } | { kind: 'clear' }
  const options: Option<PersonOption>[] = results
    .filter((r) => r.row.id !== row.id)
    .slice(0, 8)
    .map((r) => ({
      key: `row:${r.row.id}`,
      label: r.row.name,
      value: { kind: 'link' as const, link: { kind: 'row' as const, rowId: r.row.id } },
      render: (
        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
          <span className="truncate">{r.row.name}</span>
          <span className="shrink-0 font-mono text-[11px] text-muted">
            {r.member.name} · {r.sheet.name}
          </span>
        </span>
      ),
    }))
  const text = query.trim()
  if (text) {
    options.push({
      key: `text:${text}`,
      label: text,
      value: { kind: 'link', link: { kind: 'text', text } },
      render: <span className="truncate">Use “{text}” as written</span>,
    })
  }
  if (!multiple && startLinks.length > 0 && !text) {
    options.push({ key: '__clear', label: 'Clear', value: { kind: 'clear' } })
  }

  const pick = (option: Option<PersonOption>) => {
    if (option.value.kind === 'clear') {
      finish([], 'stay')
      return
    }
    const link = option.value.link
    if (!multiple) {
      finish([link], 'stay')
      return
    }
    setLinks((current) =>
      current.some((l) => linkKey(l) === linkKey(link)) ? current : [...current, link],
    )
    setQuery('')
  }

  return (
    <OptionList
      label={def.label}
      query={query}
      onQuery={setQuery}
      options={options}
      onPick={pick}
      onCommit={(move) => finish(links, move)}
      onCancel={onCancel}
      footer={
        multiple ? (
          <>
            {links.length > 0 ? (
              <div className="flex flex-wrap gap-1 border-t border-border px-1 pt-1.5 pb-1">
                {links.map((link) => (
                  <span
                    key={linkKey(link)}
                    className="inline-flex h-6 max-w-full items-center gap-1 rounded-chip bg-surface-hover pr-1 pl-2 text-xs"
                  >
                    <span className="truncate">
                      {link.kind === 'row' ? <LinkedRowName rowId={link.rowId} /> : link.text}
                    </span>
                    <button
                      type="button"
                      aria-label="Remove"
                      onMouseDown={(e) => {
                        e.preventDefault()
                        setLinks((current) => current.filter((l) => linkKey(l) !== linkKey(link)))
                      }}
                      className="grid size-4 place-items-center rounded-chip text-muted hover:text-text"
                    >
                      <X aria-hidden className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <EditorFooter onDone={() => finish(links, 'stay')} />
          </>
        ) : (
          <p className="border-t border-border px-2 pt-1.5 pb-1 text-xs text-muted">
            Search every tab, or keep the text as written
          </p>
        )
      }
    />
  )
}
