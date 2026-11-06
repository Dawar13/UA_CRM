/**
 * The quick-add language (CLAUDE.md §2.6), as a pure function: text, the sheet and what already
 * exists in; parsed contacts out, every field with how sure the parser is.
 *
 *   Rohan Mehta / Plant Head @ Hosur Precision Forge, Hosur
 *   why: 4 heading lines, unplanned downtime is his KPI
 *   +91 98450 12345  rohan@hpf.in  linkedin.com/in/rohanmehta
 *   via: Krithik  #warm #foundry  stage: first call
 *   next: fri 4pm send ROI note
 *
 * - The first line is `Name / Title @ Company, Location`; only the name is needed.
 * - Phones, emails and links are found anywhere. `key: value` fills a column (aliases, or any
 *   column by an unambiguous start of its name); a value runs to the next key, a #tag, or the
 *   end of the line. #warm, #waiting and #cold set warmth; any other #word is a tag.
 * - Nothing is dropped: whatever is not understood goes to Notes.
 * - A blank line separates contacts. A line starting with `>` logs a touch on the selected row.
 */
import * as chrono from 'chrono-node'
import { findPhoneNumbersInText } from 'libphonenumber-js'
import { matchOption, parseDateInput, parseNextAction, parsePastedCell } from '../cellInput'
import { formatFuzzyDate, IST_OFFSET_MINUTES, istDateOf, parseFuzzyDate } from '../dates'
import { formatPhone, normaliseName, normalisePhone } from '../identity'
import type { NewRowValues } from '../rows'
import type { ColumnDef, HistoryKind, Id, LinkRef, NextAction, Sheet, Tag, Warmth } from '../types'
import { warmthLabel } from '../warmth'

export type Confidence = 'high' | 'medium' | 'low'

export interface PreviewField {
  key: string
  label: string
  display: string
  confidence: Confidence
}

export interface ParsedContact {
  values: NewRowValues
  /** Tag names that do not exist yet: created when the contact is saved. */
  newTags: string[]
  preview: PreviewField[]
  /** Things to look at before saving (sentence case). */
  warnings: string[]
}

export interface ParsedTouch {
  kind: Extract<HistoryKind, 'note' | 'call' | 'meeting' | 'whatsapp' | 'email'>
  text: string
  nextAction: NextAction | null
  preview: PreviewField[]
}

export type QuickAddResult =
  | { kind: 'contacts'; contacts: ParsedContact[] }
  | { kind: 'touch'; touch: ParsedTouch }

/** Someone already in the CRM, anywhere, for `via:` and person links. */
export interface KnownPerson {
  id: Id
  name: string
  /** "Dawar · Connectors". */
  where: string
}

export interface QuickAddContext {
  now: Date
  sheet: Sheet
  tags: readonly Tag[]
  people: readonly KnownPerson[]
}

// ---------- Keys ----------

type Target =
  | 'name'
  | 'title'
  | 'company'
  | 'phone'
  | 'email'
  | 'linkedin'
  | 'links'
  | 'notes'
  | 'why'
  | 'location'
  | 'introducedBy'
  | 'connectsTo'
  | 'stage'
  | 'warmth'
  | 'tags'
  | 'next'
  | 'nextDate'

const ALIASES: Record<string, Target> = {
  name: 'name',
  title: 'title',
  designation: 'title',
  co: 'company',
  company: 'company',
  org: 'company',
  phone: 'phone',
  ph: 'phone',
  mobile: 'phone',
  mob: 'phone',
  m: 'phone',
  tel: 'phone',
  t: 'phone',
  whatsapp: 'phone',
  email: 'email',
  mail: 'email',
  e: 'email',
  linkedin: 'linkedin',
  li: 'linkedin',
  web: 'links',
  website: 'links',
  w: 'links',
  www: 'links',
  link: 'links',
  links: 'links',
  why: 'why',
  rel: 'why',
  note: 'notes',
  notes: 'notes',
  n: 'notes',
  loc: 'location',
  location: 'location',
  via: 'introducedBy',
  intro: 'introducedBy',
  'introduced by': 'introducedBy',
  connects: 'connectsTo',
  'connects to': 'connectsTo',
  stage: 'stage',
  s: 'stage',
  warmth: 'warmth',
  tag: 'tags',
  tags: 'tags',
  next: 'next',
  'next action': 'next',
  'next date': 'nextDate',
}

const SYSTEM_TARGET: Record<string, Target> = {
  name: 'name',
  company: 'company',
  title: 'title',
  phone: 'phone',
  email: 'email',
  linkedin: 'linkedin',
  links: 'links',
  notes: 'notes',
  introducedBy: 'introducedBy',
  connectsTo: 'connectsTo',
  stage: 'stage',
  warmth: 'warmth',
  tags: 'tags',
  nextAction: 'next',
  nextDate: 'nextDate',
}

type KeyResolution =
  | { kind: 'target'; target: Target; confidence: Confidence; label: string }
  | { kind: 'column'; column: ColumnDef; confidence: Confidence }
  | { kind: 'ambiguous'; labels: string[] }
  | { kind: 'unknown' }

function resolveKey(raw: string, sheet: Sheet): KeyResolution {
  const key = raw.trim().toLowerCase().replace(/\s+/g, ' ')
  const alias = ALIASES[key]
  if (alias) return { kind: 'target', target: alias, confidence: 'high', label: raw }
  const live = sheet.columns.filter((c) => !c.deletedAt)
  const exact = live.filter((c) => c.label.toLowerCase() === key)
  const matches =
    exact.length > 0 ? exact : live.filter((c) => c.label.toLowerCase().startsWith(key))
  if (matches.length === 1) {
    const column = matches[0] as ColumnDef
    const confidence: Confidence = exact.length === 1 ? 'high' : 'medium'
    if (column.system) {
      const target = SYSTEM_TARGET[column.key]
      return target
        ? { kind: 'target', target, confidence, label: column.label }
        : { kind: 'unknown' }
    }
    return { kind: 'column', column, confidence }
  }
  if (matches.length > 1) return { kind: 'ambiguous', labels: matches.map((c) => c.label) }
  return { kind: 'unknown' }
}

/** Could these words (lowercased, spaces) start a key? Used to grow "plant location:". */
function isKnownKey(phrase: string, sheet: Sheet): boolean {
  if (ALIASES[phrase]) return true
  return sheet.columns.some((c) => !c.deletedAt && c.label.toLowerCase() === phrase)
}

// ---------- Lines into parts ----------

interface LineParts {
  /** Text that is not a key's value or a tag, in order. */
  free: string[]
  pairs: { key: string; value: string }[]
  tags: string[]
}

const TAG_WORD = /^#([\p{L}\p{N}][\p{L}\p{N}_-]*)[.,;:]?$/u

function isKeyWord(word: string): boolean {
  return /^[\p{L}][\p{L}\p{N}]*:$/u.test(word)
}

function splitLine(line: string, sheet: Sheet): LineParts {
  // Words with the spaces after them, so free text keeps its spacing.
  const tokens: { word: string; gap: string }[] = []
  for (const m of line.matchAll(/(\S+)(\s*)/g)) tokens.push({ word: m[1] ?? '', gap: m[2] ?? '' })
  const parts: LineParts = { free: [], pairs: [], tags: [] }
  let free = ''
  let current: { key: string; value: string[] } | null = null
  const flushFree = () => {
    if (free.trim()) parts.free.push(free.trim())
    free = ''
  }
  const flushPair = () => {
    if (current) parts.pairs.push({ key: current.key, value: current.value.join(' ').trim() })
    current = null
  }
  for (const { word, gap } of tokens) {
    const tag = TAG_WORD.exec(word)
    if (tag?.[1]) {
      flushPair()
      flushFree()
      parts.tags.push(tag[1])
      continue
    }
    if (isKeyWord(word)) {
      let key = word.slice(0, -1)
      // "plant location:" and "introduced by:": take the words before when they make a key.
      const before = current ? current.value : free.trim().split(/\s+/).filter(Boolean)
      for (let n = Math.min(2, before.length); n >= 1; n--) {
        const phrase = [...before.slice(before.length - n), key].join(' ').toLowerCase()
        if (isKnownKey(phrase, sheet)) {
          key = [...before.slice(before.length - n), key].join(' ')
          before.splice(before.length - n, n)
          if (!current) free = before.join(' ')
          break
        }
      }
      flushPair()
      flushFree()
      current = { key, value: [] }
      continue
    }
    if (current) current.value.push(word)
    else free += word + gap
  }
  flushPair()
  flushFree()
  return parts
}

// ---------- Things found anywhere ----------

const EMAIL_RE = /[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[A-Za-z]{2,}/g
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s,]*)?/gi

interface Found {
  phones: string[]
  emails: string[]
  linkedin: string[]
  links: string[]
  rest: string
}

function findContacts(text: string): Found {
  const found: Found = { phones: [], emails: [], linkedin: [], links: [], rest: text }
  let rest = text.replace(/mailto:/gi, ' ')
  rest = rest.replace(EMAIL_RE, (m) => {
    found.emails.push(m.replace(/^mailto:/i, ''))
    return ' '
  })
  rest = rest.replace(URL_RE, (m) => {
    const url = m.replace(/[.)]+$/, '')
    const lower = url.toLowerCase()
    if (/linkedin\.com\/in\//.test(lower)) found.linkedin.push(url)
    else if (/(^|\/\/|\.)wa\.me\//.test(lower)) {
      const digits = url.replace(/^.*wa\.me\//i, '').replace(/\D/g, '')
      if (digits) found.phones.push(`+${digits}`)
    } else found.links.push(url)
    return ' '
  })
  // Numbers side by side ("98450 12345  98450 67890") are read chunk by chunk.
  const chunks = rest.split(/(\s{2,}|\s*[|,;/]\s*)/)
  rest = chunks
    .map((chunk) => {
      let text = chunk
      const phones = findPhoneNumbersInText(text, 'IN')
      for (const match of [...phones].reverse()) {
        text = `${text.slice(0, match.startsAt)} ${text.slice(match.endsAt)}`
      }
      found.phones.push(...phones.map((m) => m.number.number))
      return text
    })
    .join('')
  found.rest = rest
  return found
}

/** Leftover text worth keeping: no lone separators or labels. */
function tidy(text: string): string {
  return text
    .replace(/(^|\s)[|•·;,–-]+(?=\s|$)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[|•·;,:–-]+\s*/, '')
    .replace(/\s*[|•·;,:–-]+$/, '')
}

// ---------- People and tags ----------

function matchPerson(
  text: string,
  people: readonly KnownPerson[],
): { link: LinkRef; display: string; confidence: Confidence } {
  const value = text.trim()
  const target = normaliseName(value).spaced
  const exact = people.filter((p) => normaliseName(p.name).spaced === target)
  const pool =
    exact.length > 0
      ? exact
      : people.filter((p) => {
          const name = normaliseName(p.name).spaced
          return name.startsWith(`${target} `) || name.split(' ').includes(target)
        })
  const unique = new Map(pool.map((p) => [p.id, p]))
  if (target && unique.size === 1) {
    const person = [...unique.values()][0] as KnownPerson
    return {
      link: { kind: 'row', rowId: person.id },
      display: `${person.name} · ${person.where}`,
      confidence: exact.length > 0 ? 'high' : 'medium',
    }
  }
  return {
    link: { kind: 'text', text: value },
    display:
      unique.size > 1 ? `${value} (several match; kept as text)` : `${value} (not in the CRM yet)`,
    confidence: 'low',
  }
}

/** "pilot_candidate", "Pilot-Candidate" and "pilot candidate" are the same tag. */
function tagKey(name: string): string {
  return name.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// ---------- One contact ----------

const WARMTH_TAGS: Record<string, Warmth> = { warm: 'warm', waiting: 'waiting', cold: 'cold' }

function parseContact(block: string, ctx: QuickAddContext): ParsedContact {
  const { sheet, now } = ctx
  const lines = block
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const values: NewRowValues = {}
  const fields: Record<string, unknown> = {}
  const preview: PreviewField[] = []
  const warnings: string[] = []
  const notes: string[] = []
  const tagIds: Id[] = []
  const newTags: string[] = []
  const links: string[] = []
  const extraPhones: string[] = []
  const extraEmails: string[] = []
  const connects: LinkRef[] = []
  const show = (key: string, label: string, display: string, confidence: Confidence) => {
    const existing = preview.findIndex((p) => p.key === key)
    const field = { key, label, display, confidence }
    if (existing >= 0) preview[existing] = field
    else preview.push(field)
  }
  const locationColumn =
    sheet.columns.find((c) => !c.deletedAt && !c.system && c.key === 'plantLocation') ??
    sheet.columns.find((c) => !c.deletedAt && !c.system && c.label.toLowerCase() === 'location')
  const whyColumn = sheet.columns.find(
    (c) => !c.deletedAt && !c.system && c.label.toLowerCase().startsWith('why'),
  )

  const setPhone = (raw: string, confidence: Confidence) => {
    const e164 = normalisePhone(raw)
    if (values.phone) {
      if ((e164 ?? raw) !== values.phone) extraPhones.push(e164 ? formatPhone(e164) : raw)
      return
    }
    values.phone = e164 ?? raw.trim()
    show('phone', 'Phone', e164 ? formatPhone(e164) : raw.trim(), e164 ? confidence : 'low')
    if (!e164) warnings.push(`${raw.trim()} does not read as a phone number`)
  }
  const setEmail = (raw: string, confidence: Confidence) => {
    const email = raw.trim()
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    if (values.email) {
      if (email.toLowerCase() !== values.email.toLowerCase()) extraEmails.push(email)
      return
    }
    values.email = email
    show('email', 'Email', email, valid ? confidence : 'low')
    if (!valid) warnings.push(`${email} does not look like an email address`)
  }
  const setLocation = (value: string, confidence: Confidence) => {
    if (!value) return
    if (locationColumn) {
      fields[locationColumn.key] = value
      show(locationColumn.key, locationColumn.label, value, confidence)
    } else {
      notes.push(`Location: ${value}`)
    }
  }
  const addFound = (found: Found, confidence: Confidence) => {
    for (const p of found.phones) setPhone(p, confidence)
    for (const e of found.emails) setEmail(e, confidence)
    for (const l of found.linkedin) {
      if (!values.linkedin) {
        values.linkedin = l
        show('linkedin', 'LinkedIn', l, confidence)
      } else links.push(l)
    }
    links.push(...found.links)
  }
  const addTag = (raw: string) => {
    const warmth = WARMTH_TAGS[raw.toLowerCase()]
    if (warmth) {
      values.warmth = warmth
      show('warmth', 'Warmth', warmthLabel(warmth), 'high')
      return
    }
    const key = tagKey(raw)
    const existing = ctx.tags.find((t) => tagKey(t.name) === key)
    if (existing) {
      if (!tagIds.includes(existing.id)) tagIds.push(existing.id)
    } else {
      const name = raw.replace(/_+/g, ' ').trim()
      if (!newTags.some((t) => tagKey(t) === key)) newTags.push(name)
    }
  }

  const applyPair = (key: string, raw: string) => {
    let value = raw
    const resolved = resolveKey(key, sheet)
    if (resolved.kind === 'ambiguous') {
      warnings.push(`“${key}” could be ${resolved.labels.join(' or ')}: kept in Notes`)
      notes.push(`${key}: ${value}`)
      return
    }
    if (resolved.kind === 'unknown') {
      const found = findContacts(value)
      const before = (values.phone ? 1 : 0) + (values.email ? 1 : 0) + links.length
      addFound(found, 'medium')
      const after = (values.phone ? 1 : 0) + (values.email ? 1 : 0) + links.length
      const rest = tidy(found.rest)
      if (rest || after === before) {
        notes.push(`${key}: ${rest || value}`)
        warnings.push(`“${key}” is not a column here: kept in Notes`)
      }
      return
    }
    if (value === '') return
    const keepsText =
      resolved.kind === 'target' &&
      ['notes', 'why', 'next', 'nextDate', 'name', 'title', 'company', 'linkedin'].includes(
        resolved.target,
      )
    if (!keepsText) {
      const found = findContacts(value)
      const wanted =
        resolved.kind === 'target' && resolved.target === 'phone'
          ? found.phones.length > 0
          : resolved.kind === 'target' && resolved.target === 'email'
            ? found.emails.length > 0
            : true
      if (wanted) {
        addFound(found, resolved.kind === 'target' ? resolved.confidence : 'medium')
        const rest = tidy(found.rest)
        if (resolved.kind === 'target' && ['phone', 'email', 'links'].includes(resolved.target)) {
          if (rest) notes.push(rest)
          return
        }
        value = rest
        if (value === '') return
      }
    }
    if (resolved.kind === 'column') {
      const parsed = parsePastedCell(resolved.column, value, now, [])
      if (parsed.ok && parsed.kind === 'patch') {
        fields[resolved.column.key] = parsed.value
        const exactOption =
          resolved.column.type === 'dropdown' &&
          resolved.column.options?.some((o) => o.toLowerCase() === value.toLowerCase())
        const confidence: Confidence =
          resolved.column.type === 'dropdown' && !exactOption ? 'medium' : resolved.confidence
        show(
          resolved.column.key,
          resolved.column.label,
          displayValue(parsed.value, now),
          confidence,
        )
      } else {
        warnings.push(
          `${resolved.column.label}: ${parsed.ok ? 'not understood' : parsed.message}. Kept in Notes`,
        )
        notes.push(`${resolved.column.label}: ${value}`)
      }
      return
    }
    const confidence = resolved.confidence
    switch (resolved.target) {
      case 'name':
        values.name = value
        show('name', 'Name', value, confidence)
        break
      case 'title':
        values.title = value
        show('title', 'Title', value, confidence)
        break
      case 'company':
        values.company = value
        show('company', 'Company', value, confidence)
        break
      case 'phone':
        setPhone(value, confidence)
        break
      case 'email':
        setEmail(value, confidence)
        break
      case 'linkedin':
        values.linkedin = value
        show('linkedin', 'LinkedIn', value, confidence)
        break
      case 'links':
        links.push(...value.split(/[\s,]+/).filter(Boolean))
        break
      case 'why':
        if (whyColumn) {
          fields[whyColumn.key] = value
          show(whyColumn.key, whyColumn.label, value, confidence)
        } else notes.push(value)
        break
      case 'notes':
        notes.push(value)
        break
      case 'location':
        setLocation(value, confidence)
        break
      case 'introducedBy': {
        const person = matchPerson(value, ctx.people)
        values.introducedBy = person.link
        show('introducedBy', 'Introduced by', person.display, person.confidence)
        break
      }
      case 'connectsTo':
        for (const part of value.split(/,\s*/)) {
          if (!part.trim()) continue
          const person = matchPerson(part, ctx.people)
          connects.push(person.link)
        }
        break
      case 'stage': {
        const names = sheet.stages.map((s) => s.name)
        if (names.length === 0) {
          warnings.push('This sheet has no stages: the stage is kept in Notes')
          notes.push(`Stage: ${value}`)
          break
        }
        const name = matchOption(names, value)
        if (name === null) {
          warnings.push(`“${value}” is not a stage here: kept in Notes`)
          notes.push(`Stage: ${value}`)
        } else {
          values.stageIndex = names.indexOf(name)
          show(
            'stage',
            'Stage',
            name,
            name.toLowerCase() === value.toLowerCase() ? confidence : 'medium',
          )
        }
        break
      }
      case 'warmth': {
        const label = matchOption(['Warm', 'Waiting', 'Cold'], value)
        if (label) {
          values.warmth = label.toLowerCase() as Warmth
          show('warmth', 'Warmth', label, confidence)
        } else {
          warnings.push(`Warmth is Warm, Waiting or Cold, not “${value}”`)
        }
        break
      }
      case 'tags':
        for (const t of value.split(/[,\s]+/)) if (t.trim()) addTag(t.replace(/^#/, ''))
        break
      case 'next': {
        const next = parseNextAction(value, now)
        if (next) {
          values.nextAction = next
          show(
            'nextAction',
            'Next action',
            next.date
              ? `${formatFuzzyDate(next.date, now)}${next.text ? ` · ${next.text}` : ''}`
              : next.text,
            next.date ? confidence : 'medium',
          )
        }
        break
      }
      case 'nextDate': {
        const date = parseDateInput(value, now)
        if (date) {
          values.nextAction = { text: values.nextAction?.text ?? '', date }
          show('nextAction', 'Next action', formatFuzzyDate(date, now), confidence)
        } else {
          warnings.push(`“${value}” is not a date`)
          notes.push(`Next date: ${value}`)
        }
        break
      }
    }
  }

  lines.forEach((line, index) => {
    const parts = splitLine(line, sheet)
    for (const tag of parts.tags) addTag(tag)
    for (const pair of parts.pairs) applyPair(pair.key, pair.value)
    for (const free of parts.free) {
      const found = findContacts(free)
      addFound(found, 'high')
      const raw = found.rest.replace(/\s+/g, ' ').trim()
      const rest = tidy(found.rest)
      if (!rest) continue
      if (index === 0 && !values.name) {
        readNameLine(raw)
        continue
      }
      // A second line like "Plant Head at Hosur Precision Forge" (LinkedIn, signatures): both
      // parts start with a capital, so "met at the Pune expo" stays a note.
      if (index === 1 && !values.title && !values.company) {
        const m = /^(\p{Lu}.*?)\s+(?:at|@|\|)\s+(\p{Lu}.*)$/u.exec(raw)
        if (m?.[1] && m[2]) {
          values.title = m[1].trim()
          values.company = m[2].trim()
          show('title', 'Title', values.title, 'medium')
          show('company', 'Company', values.company, 'medium')
          continue
        }
      }
      notes.push(rest)
    }
  })

  function readNameLine(text: string) {
    let rest = text
    let company = ''
    let location = ''
    const at = rest.split(/\s+@\s+/)
    if (at.length > 1) {
      rest = at[0] ?? ''
      const right = at.slice(1).join(' @ ')
      const comma = right.indexOf(',')
      company = (comma >= 0 ? right.slice(0, comma) : right).trim()
      location = comma >= 0 ? right.slice(comma + 1).trim() : ''
    }
    const slash = rest.split(/\s+\/\s+/)
    let name = (slash[0] ?? '').trim()
    const title = tidy(slash.slice(1).join(' / '))
    let extra = ''
    if (at.length === 1 && slash.length === 1) {
      // "Rohan Mehta, Plant Head" or "Rohan Mehta | HPF": the name is the first part.
      const split = /^(.+?)\s*(?:,|\||–| - )\s*(.+)$/.exec(name)
      if (split?.[1] && split[2]) {
        name = split[1]
        extra = tidy(split[2])
      }
    }
    name = tidy(name)
    if (name) {
      values.name = name
      const words = name.split(/\s+/).length
      show('name', 'Name', name, /\p{L}/u.test(name) && words <= 5 ? 'high' : 'medium')
    }
    if (title) {
      values.title = title
      show('title', 'Title', title, 'high')
    }
    if (company) {
      values.company = company
      show('company', 'Company', company, 'high')
    }
    if (location) setLocation(location, 'high')
    if (extra) {
      const m = /^(.+?)\s+(?:at|@)\s+(.+)$/i.exec(extra)
      if (m?.[1] && m[2] && !values.title && !values.company) {
        values.title = m[1].trim()
        values.company = m[2].trim()
        show('title', 'Title', values.title, 'medium')
        show('company', 'Company', values.company, 'medium')
      } else notes.push(extra)
    }
  }

  if (links.length > 0) {
    values.links = [...new Set(links)]
    show('links', 'Links', values.links.join(', '), 'high')
  }
  if (connects.length > 0) {
    values.connectsTo = connects
    show(
      'connectsTo',
      'Connects to',
      connects
        .map((l) =>
          l.kind === 'row' ? (ctx.people.find((p) => p.id === l.rowId)?.name ?? '') : l.text,
        )
        .join(', '),
      connects.some((l) => l.kind === 'text') ? 'medium' : 'high',
    )
  }
  if (extraPhones.length > 0) notes.push(`Also: ${extraPhones.join(', ')}`)
  if (extraEmails.length > 0) notes.push(`Also: ${extraEmails.join(', ')}`)
  if (tagIds.length > 0 || newTags.length > 0) {
    values.tagIds = tagIds
    const names = [
      ...tagIds.map((id) => ctx.tags.find((t) => t.id === id)?.name ?? ''),
      ...newTags.map((t) => `${t} (new)`),
    ]
    show('tags', 'Tags', names.join(', '), newTags.length > 0 ? 'medium' : 'high')
  }
  if (Object.keys(fields).length > 0) values.fields = fields
  if (notes.length > 0) {
    values.notes = notes.join('\n')
    show('notes', 'Notes', values.notes, 'high')
  }
  if (!values.name || !/\p{L}|\p{N}/u.test(values.name)) {
    warnings.unshift('A row needs a name: put it on the first line')
  }
  // Name first, then the rest in the order a person reads a contact.
  const order = ['name', 'title', 'company']
  preview.sort((a, b) => {
    const ia = order.indexOf(a.key)
    const ib = order.indexOf(b.key)
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
  })
  return { values, newTags, preview, warnings }
}

function displayValue(value: unknown, now: Date): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object' && 'precision' in (value as object)) {
    return formatFuzzyDate(value as Parameters<typeof formatFuzzyDate>[0], now)
  }
  if (typeof value === 'object' && 'kind' in (value as object)) {
    const link = value as LinkRef
    return link.kind === 'text' ? link.text : 'A row'
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

// ---------- Logging a touch ----------

const TOUCH_WORDS: [RegExp, ParsedTouch['kind']][] = [
  [/^(called|call|rang|spoke|phoned)\b/i, 'call'],
  [/^(met|meeting|visited|visit|lunch|coffee)\b/i, 'meeting'],
  [/^(whatsapp|whatsapped|wa|messaged|texted)\b/i, 'whatsapp'],
  [/^(emailed|email|mailed|wrote)\b/i, 'email'],
]

const KIND_LABEL: Record<ParsedTouch['kind'], string> = {
  note: 'Note',
  call: 'Call',
  meeting: 'Meeting',
  whatsapp: 'WhatsApp',
  email: 'Email',
}

const capitalise = (s: string) => (s ? s[0]?.toUpperCase() + s.slice(1) : s)

function parseTouch(text: string, now: Date): ParsedTouch {
  const body = text
    .replace(/^\s*>\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
  const kind = TOUCH_WORDS.find(([re]) => re.test(body))?.[1] ?? 'note'
  let nextAction: NextAction | null = null
  const nextKey = /\bnext:\s*(.+)$/i.exec(body)
  let historyText = body
  if (nextKey?.[1]) {
    nextAction = parseNextAction(nextKey[1], now)
    historyText = body.slice(0, nextKey.index).replace(/[,\s]+$/, '')
  } else {
    // The last part that names a date is the next action: "quote by 15 nov".
    const segments = body.split(/,\s*/)
    for (let i = segments.length - 1; i >= 1; i--) {
      const segment = segments[i] ?? ''
      const date = findDate(segment, now)
      if (date) {
        const action = segment
          .replace(date.text, ' ')
          .replace(/\b(by|on|before|for|around|till|until|in)\s*$/i, '')
          .replace(/\s+/g, ' ')
          .trim()
        nextAction = { date: date.value, text: capitalise(action) }
        break
      }
    }
  }
  const preview: PreviewField[] = [
    { key: 'kind', label: 'Touch', display: `${KIND_LABEL[kind]}, today`, confidence: 'high' },
    { key: 'text', label: 'What happened', display: capitalise(historyText), confidence: 'high' },
  ]
  if (nextAction) {
    preview.push({
      key: 'nextAction',
      label: 'Next action',
      display: nextAction.date
        ? `${formatFuzzyDate(nextAction.date, now)}${nextAction.text ? ` · ${nextAction.text}` : ''}`
        : nextAction.text,
      confidence: nextAction.date ? 'high' : 'medium',
    })
  }
  return { kind, text: capitalise(historyText), nextAction, preview }
}

const DATE_HINT =
  /\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|mon|tue|wed|thu|fri|sat|sun|tomorrow|today|week|month/i

/** A date inside a phrase ("quote by 15 nov" → 15 Nov), and the words that said it. */
function findDate(
  segment: string,
  now: Date,
): { value: NonNullable<NextAction['date']>; text: string } | null {
  const words = segment.split(' ')
  for (let start = 0; start < words.length; start++) {
    for (let n = Math.min(4, words.length - start); n >= 1; n--) {
      const phrase = words.slice(start, start + n).join(' ')
      if (!DATE_HINT.test(phrase)) continue
      const fuzzy = parseFuzzyDate(phrase, now)
      if (fuzzy) return { value: fuzzy, text: phrase }
      const [result] = chrono.en.GB.parse(
        phrase,
        { instant: now, timezone: IST_OFFSET_MINUTES },
        { forwardDate: true },
      )
      if (result && result.index === 0 && result.text.length === phrase.length) {
        return { value: { date: istDateOf(result.start.date()), precision: 'day' }, text: phrase }
      }
    }
  }
  return null
}

// ---------- Entry point ----------

export function parseQuickAdd(text: string, ctx: QuickAddContext): QuickAddResult {
  if (/^\s*>/.test(text)) return { kind: 'touch', touch: parseTouch(text, ctx.now) }
  const blocks = text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
  return { kind: 'contacts', contacts: blocks.map((b) => parseContact(b, ctx)) }
}
