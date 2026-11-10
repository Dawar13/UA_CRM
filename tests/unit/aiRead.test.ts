import { describe, expect, it } from 'vitest'
import { AiReadError } from '@/data/repository'
import {
  aiErrorMessage,
  csvRowCount,
  fileForAi,
  fileType,
  MAX_CSV_ROWS,
  todayForAi,
} from '@/features/quick-add/useReadWithAi'

// The browser side of reading with AI (D-055): which files go, and what a refusal says.

describe('files for the AI', () => {
  it.each([
    ['card.PDF', '', 'application/pdf'],
    ['photo.jpeg', '', 'image/jpeg'],
    ['IMG_1.HEIC', '', 'image/heic'],
    ['list.csv', 'application/vnd.ms-excel', 'text/csv'],
    ['notes', 'text/plain', 'text/plain'],
    ['deck.pptx', '', null],
    ['archive.zip', 'application/zip', null],
  ])('%s (%s) is %s', (name, type, expected) => {
    expect(fileType({ name, type })).toBe(expected)
  })

  it('counts CSV rows after the header, ignoring blank lines', () => {
    expect(csvRowCount('Name,Company\r\nA,B\r\n\r\nC,D\n')).toBe(2)
    expect(csvRowCount('')).toBe(0)
  })

  it('sends a PDF as base64 and refuses what it cannot read or what is too long', async () => {
    const pdf = new File(['%PDF-1.4'], 'card.pdf', { type: 'application/pdf' })
    expect(await fileForAi(pdf)).toEqual({
      name: 'card.pdf',
      mimeType: 'application/pdf',
      data: btoa('%PDF-1.4'),
    })
    await expect(fileForAi(new File(['x'], 'a.zip'))).rejects.toMatchObject({
      code: 'unsupported',
    })
    const rows = Array.from({ length: MAX_CSV_ROWS + 5 }, (_, i) => `P${i},Co`).join('\n')
    await expect(
      fileForAi(new File([`Name,Company\n${rows}`], 'long.csv', { type: 'text/csv' })),
    ).rejects.toMatchObject({ code: `csv_rows:${MAX_CSV_ROWS + 5}` })
    const big = new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'big.pdf')
    await expect(fileForAi(big)).rejects.toMatchObject({ code: 'too_large' })
  })

  it('names today in IST', () => {
    expect(todayForAi(new Date('2026-11-10T20:00:00Z'))).toBe('Wed 11 Nov 2026')
  })
})

describe('what a refusal says', () => {
  it.each([
    ['not_configured', 'AI reading is not set up on the server yet.'],
    [
      'busy',
      'The free AI allowance is used up for the moment. Try again in a minute, or press Enter to read it without AI.',
    ],
    ['too_large', 'That file is over 3 MB. Try a smaller one, or a photo of one page.'],
    ['unreadable', 'The AI could not read that. Try clearer text, or another file.'],
    ['empty', 'No contacts found in that.'],
    ['unauthorized', 'Your sign-in could not be confirmed. Sign out and in again, then retry.'],
    ['network', 'The AI did not answer. Try again in a minute.'],
    [
      'csv_rows:240',
      'That CSV has 240 rows. For long lists use Sheet options → Import, which maps the columns once for every row.',
    ],
  ])('%s', (code, message) => {
    expect(aiErrorMessage(new AiReadError(code))).toBe(message)
  })
})
