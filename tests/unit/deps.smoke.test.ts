/**
 * Dependency smoke tests (Phase 0, M0.1 step 9).
 *
 * Every runtime library for all three phases must load in Node and do one real thing, so a later
 * phase never stalls on tooling. Heavy libraries (pdfjs, OCR) are only imported here; nothing is
 * downloaded (no OCR models, no fonts, no network).
 */
import { TZDate, tz } from '@date-fns/tz'
import { createClient } from '@supabase/supabase-js'
import { parse as chronoParse, parseDate } from 'chrono-node'
import { cva } from 'class-variance-authority'
import { clsx } from 'clsx'
import { format } from 'date-fns'
import Dexie, { type EntityTable } from 'dexie'
import ExcelJS from 'exceljs'
import { distance } from 'fastest-levenshtein'
import { jsPDF } from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { twMerge } from 'tailwind-merge'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createStore } from 'zustand/vanilla'

/** The fixed reference instant used across the test suite: Thu 5 Nov 2026, 10:00 IST. */
const REFERENCE = new Date('2026-11-05T10:00:00+05:30')
const IST = tz('Asia/Kolkata')
/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MINUTES = 330

describe('Phase 1 parsing libraries', () => {
  it('chrono-node parses "fri 4pm" forward from the IST reference', () => {
    const parsed = parseDate(
      'fri 4pm',
      { instant: REFERENCE, timezone: IST_OFFSET_MINUTES },
      { forwardDate: true },
    )
    expect(parsed).not.toBeNull()
    expect(parsed?.toISOString()).toBe('2026-11-06T10:30:00.000Z')
    expect(format(parsed as Date, 'EEE d MMM yyyy HH:mm', { in: IST })).toBe('Fri 6 Nov 2026 16:00')

    const [result] = chronoParse('fri 4pm', { instant: REFERENCE, timezone: IST_OFFSET_MINUTES })
    expect(result?.start.get('weekday')).toBe(5)
    expect(result?.start.get('hour')).toBe(16)
  })

  it('libphonenumber-js normalises an Indian mobile number to E.164', () => {
    const phone = parsePhoneNumberFromString('+91 98450 12345', 'IN')
    expect(phone?.isValid()).toBe(true)
    expect(phone?.number).toBe('+919845012345')
  })

  it('@date-fns/tz formats a UTC instant in IST', () => {
    const instant = new Date('2026-11-05T04:30:00Z')
    expect(format(instant, 'd MMM yyyy, h:mm a', { in: IST })).toBe('5 Nov 2026, 10:00 AM')
    const inIst = new TZDate(instant, 'Asia/Kolkata')
    expect(inIst.getHours()).toBe(10)
    expect(inIst.getTimezoneOffset()).toBe(-IST_OFFSET_MINUTES)
  })

  it('date-fns formats a date', () => {
    expect(format(new Date(2026, 10, 5), 'd MMM yyyy')).toBe('5 Nov 2026')
  })

  it('fastest-levenshtein measures edit distance', () => {
    expect(distance('Navaneetha Krishnan', 'Navaneethakrishnan')).toBe(2)
  })
})

describe('Phase 1 export libraries', () => {
  it('ExcelJS writes a workbook with a coloured cell to a buffer', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Customers')
    const cell = sheet.getCell('A1')
    cell.value = 'Warm'
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } }
    cell.font = { color: { argb: 'FF15803D' } }

    const buffer = await workbook.xlsx.writeBuffer()
    const bytes = new Uint8Array(buffer)
    // .xlsx is a zip archive: it starts with the "PK" local file header.
    expect(bytes.byteLength).toBeGreaterThan(1000)
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b])

    const roundTrip = new ExcelJS.Workbook()
    await roundTrip.xlsx.load(buffer)
    const fill = roundTrip.getWorksheet('Customers')?.getCell('A1').fill
    expect(fill).toMatchObject({ type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCFCE7' } })
  })

  it('jsPDF with autotable renders a two-row table to an ArrayBuffer', () => {
    const doc = new jsPDF({ orientation: 'landscape', format: 'a4' })
    autoTable(doc, {
      head: [['Name', 'Company', 'Warmth']],
      body: [
        ['Rohan Mehta', 'Hosur Precision Forge', 'Warm'],
        ['Meera Iyer', 'Pune Castings', 'Waiting'],
      ],
    })
    const output = doc.output('arraybuffer')
    expect(output).toBeInstanceOf(ArrayBuffer)
    const header = new TextDecoder().decode(output.slice(0, 5))
    expect(header).toBe('%PDF-')
    expect(doc.getNumberOfPages()).toBe(1)
  })
})

describe('Phase 1 backend client', () => {
  it('supabase-js createClient accepts a dummy URL without throwing', () => {
    const client = createClient('https://dummy-project.supabase.co', 'dummy-anon-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 1 } },
    })
    expect(typeof client.from).toBe('function')
    expect(typeof client.auth.signInWithOAuth).toBe('function')
  })
})

describe('Phase 2 file-import libraries', () => {
  it("pdfjs-dist's legacy build imports in Node and exposes getDocument", {
    timeout: 30_000,
  }, async () => {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    expect(typeof pdfjs.getDocument).toBe('function')
    expect(pdfjs.version).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('tesseract.js resolves through dynamic import (no worker, no model download)', async () => {
    const tesseract = await import('tesseract.js')
    const api = tesseract.default ?? tesseract
    expect(typeof api.createWorker).toBe('function')
    expect(typeof api.recognize).toBe('function')
  })

  it('@paddleocr/paddleocr-js resolves through dynamic import (no model download)', async () => {
    const paddle = await import('@paddleocr/paddleocr-js')
    expect(typeof paddle.PaddleOCR).toBe('function')
  })
})

describe('Phase 0 runtime utilities', () => {
  it('zod parses and rejects', () => {
    const Warmth = z.enum(['warm', 'waiting', 'cold'])
    expect(Warmth.parse('warm')).toBe('warm')
    expect(Warmth.safeParse('hot').success).toBe(false)
  })

  it('Dexie opens a database and round-trips a row (fake-indexeddb)', async () => {
    const db = new Dexie('deps-smoke', { autoOpen: true }) as Dexie & {
      rows: EntityTable<{ id: string; name: string }, 'id'>
    }
    db.version(1).stores({ rows: 'id' })
    await db.rows.put({ id: 'r1', name: 'Rohan Mehta' })
    expect(await db.rows.get('r1')).toEqual({ id: 'r1', name: 'Rohan Mehta' })
    await db.delete()
  })

  it('zustand createStore holds and updates state', () => {
    const store = createStore<{ count: number; bump: () => void }>()((set) => ({
      count: 0,
      bump: () => set((state) => ({ count: state.count + 1 })),
    }))
    store.getState().bump()
    expect(store.getState().count).toBe(1)
  })

  it('clsx, tailwind-merge and class-variance-authority compose classes', () => {
    expect(clsx('a', false, { b: true, c: false })).toBe('a b')
    expect(twMerge('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    const button = cva('btn', {
      variants: { tone: { primary: 'btn-primary', ghost: 'btn-ghost' } },
    })
    expect(button({ tone: 'primary' })).toBe('btn btn-primary')
  })
})
