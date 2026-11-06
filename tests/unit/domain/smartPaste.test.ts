import { describe, expect, it } from 'vitest'
import { isContactText } from '@/domain/quickadd/smartPaste'

describe('smart paste: a signature or a spreadsheet block', () => {
  it('sends a signature or profile to quick add', () => {
    expect(
      isContactText('Meera Iyer\nCOO | Lakshmi Textiles\nM: +91 98765 43210 | meera@lakshmitex.in'),
    ).toBe(true)
    expect(isContactText('Rohan Mehta\nPlant Head, Hosur Precision Forge\nrohan@hpf.in')).toBe(true)
    expect(isContactText('Kabir Shah\n+91 98450 12345')).toBe(true)
    expect(isContactText('Asha Rao\nlinkedin.com/in/asharao')).toBe(true)
    expect(isContactText('Asha Rao\r\nhttps://kovaipumps.example')).toBe(true)
    expect(isContactText('Asha Rao / CEO @ Kovai Pumps\nvia: Krithik')).toBe(true)
  })

  it('keeps a column copied from a spreadsheet in the grid', () => {
    // One column of names, as Excel and Google Sheets copy it.
    expect(isContactText('Meera Iyer\nKabir Shah')).toBe(false)
    expect(isContactText('Meera Iyer\r\nKabir Shah\r\n')).toBe(false)
    expect(isContactText('Hosur Precision Forge\nKovai Pumps\nLakshmi Textiles')).toBe(false)
  })

  it('keeps tabbed blocks and anything with an HTML table in the grid', () => {
    expect(isContactText('COO\t098450 99999')).toBe(false)
    expect(isContactText('Meera Iyer\nmeera@lakshmitex.in\tCOO')).toBe(false)
    expect(
      isContactText(
        'Meera Iyer\nmeera@lakshmitex.in',
        '<table><tr><td>Meera Iyer</td></tr></table>',
      ),
    ).toBe(false)
  })

  it('treats a single line as a cell value', () => {
    expect(isContactText('meera@lakshmitex.in')).toBe(false)
    expect(isContactText('  \n+91 98765 43210\n  ')).toBe(false)
  })
})
