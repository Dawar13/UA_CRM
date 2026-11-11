/**
 * Reading contacts with AI from quick add (D-055): free text, a PDF, a photo, a CSV or a text
 * file. Photos are scaled down in the browser first (a phone photo is several MB); everything
 * then goes to the server, which asks the AI. The answer comes back as quick-add text.
 */
import { useMutation } from '@tanstack/react-query'
import { useActor } from '@/auth/AuthContext'
import { useMembers } from '@/data/hooks'
import { useRepository } from '@/data/RepositoryContext'
import { AiReadError, type AiReadInput } from '@/data/repository'
import { aiContactsToQuickAdd } from '@/domain/quickadd/fromAi'
import type { Sheet } from '@/domain/types'

/** A file larger than this (after scaling a photo) is refused before it is sent. */
export const MAX_FILE_BYTES = 3 * 1024 * 1024
/** A CSV longer than this goes through Import (Sheet options), which maps columns for any size. */
export const MAX_CSV_ROWS = 60
/** Photos are scaled so their longer side is at most this. */
const PHOTO_MAX_SIDE = 1600

export const AI_FILE_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.csv,.txt,application/pdf,image/*,text/csv,text/plain'

const TYPES_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  csv: 'text/csv',
  txt: 'text/plain',
}

export function fileType(file: { name: string; type: string }): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  const byExtension = TYPES_BY_EXTENSION[ext]
  if (byExtension) return byExtension
  return Object.values(TYPES_BY_EXTENSION).includes(file.type) ? file.type : null
}

/** Rows in a CSV after the header (a quoted line break counts as a row; close enough here). */
export function csvRowCount(text: string): number {
  return Math.max(0, text.split(/\r?\n/).filter((l) => l.trim() !== '').length - 1)
}

export function aiErrorMessage(error: unknown): string {
  const code = error instanceof AiReadError ? error.code : ''
  if (code.startsWith('csv_rows:')) {
    return `That CSV has ${code.slice(9)} rows. For long lists use Sheet options → Import, which maps the columns once for every row.`
  }
  switch (code) {
    case 'not_configured':
      return 'AI reading is not set up on the server yet.'
    case 'busy':
      return 'The free AI allowance is used up for the moment. Try again in a minute, or press Enter to read it without AI.'
    case 'too_large':
      return 'That file is over 3 MB. Try a smaller one, or a photo of one page.'
    case 'unsupported':
      return 'That kind of file can’t be read. Use a PDF, a photo, a CSV or a text file.'
    case 'unreadable':
      return 'The AI could not read that. Try clearer text, or another file.'
    case 'unauthorized':
      return 'Your sign-in could not be confirmed. Sign out and in again, then retry.'
    case 'empty':
      return 'No contacts found in that.'
    default:
      return 'The AI did not answer. Try again in a minute.'
  }
}

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.length; i += 0x8000) {
    binary += String.fromCharCode(...view.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** A JPEG no larger than PHOTO_MAX_SIDE, or the file itself when the browser can't draw it. */
async function scaledPhoto(file: File): Promise<{ type: string; bytes: ArrayBuffer }> {
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.85),
    )
    if (blob) return { type: 'image/jpeg', bytes: await blob.arrayBuffer() }
  } catch {
    // HEIC outside Safari, for example: send it as it is.
  }
  return { type: fileType(file) ?? file.type, bytes: await file.arrayBuffer() }
}

export async function fileForAi(file: File): Promise<NonNullable<AiReadInput['file']>> {
  const type = fileType(file)
  if (!type) throw new AiReadError('unsupported')
  if (type === 'text/csv') {
    const rows = csvRowCount(await file.text())
    if (rows > MAX_CSV_ROWS) throw new AiReadError(`csv_rows:${rows}`)
  }
  const { type: sentType, bytes } = type.startsWith('image/')
    ? await scaledPhoto(file)
    : { type, bytes: await file.arrayBuffer() }
  if (bytes.byteLength > MAX_FILE_BYTES) throw new AiReadError('too_large')
  return { name: file.name, mimeType: sentType, data: toBase64(bytes) }
}

export function sheetForAi(sheet: Sheet): AiReadInput['sheet'] {
  return {
    name: sheet.name,
    stages: sheet.stages.map((s) => s.name),
    columns: sheet.columns
      .filter((c) => !c.system && !c.deletedAt && c.type !== 'files')
      .map((c) => ({ label: c.label, options: c.options ?? [] })),
  }
}

/** "Tue 10 Nov 2026", in IST. */
export function todayForAi(now: Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  })
    .format(now)
    .replace(/,/g, '')
}

export type AiSource = { text: string } | { file: File }

/** Reads with the AI; resolves to quick-add text, or throws an AiReadError. */
export function useReadWithAi(sheet: Sheet) {
  const repository = useRepository()
  const actor = useActor()
  const { data: members = [] } = useMembers()
  return useMutation({
    mutationFn: async (source: AiSource): Promise<string> => {
      if (!actor) throw new AiReadError('unauthorized')
      const input: AiReadInput = {
        ...('text' in source ? { text: source.text } : { file: await fileForAi(source.file) }),
        sheet: sheetForAi(sheet),
        today: todayForAi(new Date()),
        team: members.map((m) => m.name),
      }
      const contacts = await repository.readWithAi(input, { actorId: actor.id, now: new Date() })
      const text = aiContactsToQuickAdd(contacts, sheet)
      if (!text) throw new AiReadError('empty')
      return text
    },
  })
}
