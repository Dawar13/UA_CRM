import {
  CalendarDays,
  Download,
  Flag,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  Plus,
  Thermometer,
  X,
} from 'lucide-react'
import type { HistoryEntry, HistoryKind } from '@/domain/types'

export const historyKindLabels: Record<HistoryKind, string> = {
  note: 'Note',
  call: 'Call',
  meeting: 'Meeting',
  whatsapp: 'WhatsApp',
  email: 'Email',
  stage: 'Stage change',
  warmth: 'Warmth change',
  created: 'Created',
  imported: 'Imported',
}

const icons = {
  note: NotebookPen,
  call: Phone,
  meeting: CalendarDays,
  whatsapp: MessageCircle,
  email: Mail,
  stage: Flag,
  warmth: Thermometer,
  created: Plus,
  imported: Download,
} as const

/** How an entry's icon tile is tinted: stage moves blue, lost brick, warmth olive, the rest neutral. */
export type HistoryTone = 'stage' | 'lost' | 'warmth' | 'neutral'

export function historyTone(entry: Pick<HistoryEntry, 'kind' | 'meta'>): HistoryTone {
  if (entry.kind === 'stage') return entry.meta?.lost ? 'lost' : 'stage'
  if (entry.kind === 'warmth') return 'warmth'
  return 'neutral'
}

/** Tile background and icon colour per tone (static, so Tailwind sees every class). */
export const historyToneClassName: Record<HistoryTone, string> = {
  stage: 'bg-[color-mix(in_srgb,var(--stage4)_18%,transparent)] text-link',
  lost: 'bg-[color-mix(in_srgb,var(--stage-lost)_14%,transparent)] text-lost',
  warmth: 'bg-[color-mix(in_srgb,var(--warm-cell)_18%,transparent)] text-secondary',
  neutral: 'bg-tile text-secondary',
}

/** The kind's icon; a lost mark shows a cross instead of the stage flag. */
export function HistoryKindIcon({ kind, lost = false }: { kind: HistoryKind; lost?: boolean }) {
  const Icon = lost ? X : icons[kind]
  return <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
}
