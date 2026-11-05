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
} from 'lucide-react'
import type { HistoryKind } from '@/domain/types'

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

export function HistoryKindIcon({ kind }: { kind: HistoryKind }) {
  const Icon = icons[kind]
  return <Icon aria-hidden className="size-3.5" strokeWidth={1.75} />
}
