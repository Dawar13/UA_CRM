import { describe, expect, it } from 'vitest'
import {
  formatPhone,
  initials,
  linkedinSlug,
  nameTitles,
  normaliseCompany,
  normaliseEmail,
  normaliseName,
  normalisePhone,
  searchTokens,
} from '@/domain/identity'

describe('normalisePhone', () => {
  it('turns Indian formats into E.164', () => {
    for (const raw of [
      '098450 12345',
      '+91-98450-12345',
      '9845012345',
      '+91 98450 12345',
      '  +91 98450 12345  ',
      '(+91) 98450-12345',
      '919845012345',
      '00919845012345',
      'wa.me/919845012345',
    ]) {
      expect(normalisePhone(raw), raw).toBe('+919845012345')
    }
  })

  it('handles landlines and foreign numbers', () => {
    expect(normalisePhone('080 2345 6789')).toBe('+918023456789')
    expect(normalisePhone('044-2345-6789')).toBe('+914423456789')
    expect(normalisePhone('+1 415 555 2671')).toBe('+14155552671')
  })

  it('returns null for invalid input', () => {
    expect(normalisePhone('')).toBeNull()
    expect(normalisePhone('   ')).toBeNull()
    expect(normalisePhone('abc')).toBeNull()
    expect(normalisePhone('12345')).toBeNull()
    expect(normalisePhone('+91 98450 1234')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('formats stored numbers for display', () => {
    expect(formatPhone('+919845012345')).toBe('+91 98450 12345')
    expect(formatPhone('+918023456789')).toBe('+91 80 2345 6789')
    expect(formatPhone('+14155552671')).toBe('+1 415 555 2671')
  })

  it('falls back to the input', () => {
    expect(formatPhone('ext 204')).toBe('ext 204')
    expect(formatPhone('')).toBe('')
  })
})

describe('normaliseEmail', () => {
  it('trims and lowercases', () => {
    expect(normaliseEmail('  Rohan@HPF.example ')).toBe('rohan@hpf.example')
    expect(normaliseEmail('mailto:Rohan@hpf.example')).toBe('rohan@hpf.example')
    expect(normaliseEmail('first.last+tag@sub.domain.co.in')).toBe(
      'first.last+tag@sub.domain.co.in',
    )
  })

  it('rejects implausible emails', () => {
    for (const raw of ['', 'rohan', 'rohan@', '@hpf.in', 'rohan@hpf', 'ro han@hpf.in', 'a@b.']) {
      expect(normaliseEmail(raw), raw).toBeNull()
    }
  })
})

describe('linkedinSlug', () => {
  it('extracts the slug from URLs', () => {
    expect(linkedinSlug('linkedin.com/in/rohanmehta/')).toBe('rohanmehta')
    expect(linkedinSlug('https://www.linkedin.com/in/RohanMehta?trk=x')).toBe('rohanmehta')
    expect(linkedinSlug('https://in.linkedin.com/in/rohan-mehta-1a2b3c#about')).toBe(
      'rohan-mehta-1a2b3c',
    )
    expect(linkedinSlug('http://linkedin.com/pub/old-style')).toBe('old-style')
    expect(linkedinSlug('https://www.linkedin.com/in/r%C3%B6han')).toBe('röhan')
    expect(linkedinSlug('https://www.linkedin.com/in/bad%E0%A4')).toBe('bad%e0%a4')
  })

  it('accepts a path or a bare slug', () => {
    expect(linkedinSlug('in/rohanmehta')).toBe('rohanmehta')
    expect(linkedinSlug('/in/rohanmehta/')).toBe('rohanmehta')
    expect(linkedinSlug('RohanMehta')).toBe('rohanmehta')
    expect(linkedinSlug('@rohan-mehta')).toBe('rohan-mehta')
  })

  it('returns null when absent', () => {
    expect(linkedinSlug('')).toBeNull()
    expect(linkedinSlug('Rohan Mehta')).toBeNull()
    expect(linkedinSlug('https://linkedin.com/company/hpf')).toBeNull()
    expect(linkedinSlug('https://example.com/in/rohan')).toBeNull()
  })
})

describe('normaliseName', () => {
  it('lists the titles from CLAUDE.md', () => {
    expect(nameTitles).toEqual([
      'Mr',
      'Ms',
      'Mrs',
      'Dr',
      'Cdr',
      'Capt',
      'Col',
      'Prof',
      'Shri',
      'Smt',
      'Er',
    ])
  })

  it('strips titles and collapses spaces', () => {
    expect(normaliseName('Cdr Arvind Menon')).toEqual(normaliseName('Arvind  Menon'))
    expect(normaliseName('Cdr Arvind Menon')).toEqual({
      spaced: 'arvind menon',
      compact: 'arvindmenon',
    })
    expect(normaliseName('Dr. A. Kumar').spaced).toBe('a kumar')
    expect(normaliseName('MRS.  Priya   Nair ').spaced).toBe('priya nair')
    expect(normaliseName('Prof Dr Rao').spaced).toBe('rao')
    expect(normaliseName('Capt. Shri Ravi').spaced).toBe('ravi')
    for (const title of nameTitles) {
      expect(normaliseName(`${title} Anil Joshi`).spaced, title).toBe('anil joshi')
      expect(normaliseName(`${title}. Anil Joshi`).spaced, title).toBe('anil joshi')
    }
  })

  it('only strips leading titles and never empties a name', () => {
    expect(normaliseName('Anil Er').spaced).toBe('anil er')
    expect(normaliseName('Dr').spaced).toBe('dr')
  })

  it('compares spaced and compact forms', () => {
    const a = normaliseName('Navaneetha Krishnan')
    const b = normaliseName('Navaneethakrishnan')
    expect(a.spaced).not.toBe(b.spaced)
    expect(a.compact).toBe(b.compact)
  })

  it('removes punctuation and accents', () => {
    expect(normaliseName("Rohan O'Brien-Mehta").spaced).toBe('rohan o brien mehta')
    expect(normaliseName('Zoë Désai').spaced).toBe('zoe desai')
    expect(normaliseName('')).toEqual({ spaced: '', compact: '' })
  })
})

describe('normaliseCompany', () => {
  it('strips legal suffixes only', () => {
    expect(normaliseCompany('Hosur Precision Forge Pvt. Ltd.')).toBe('hosur precision forge')
    expect(normaliseCompany('Hosur Precision Forge Private Limited')).toBe('hosur precision forge')
    expect(normaliseCompany('Hosur Precision Forge Pvt Ltd')).toBe('hosur precision forge')
    expect(normaliseCompany('Hosur Precision Forge (P) Ltd')).toBe('hosur precision forge')
    expect(normaliseCompany('Pune Castings Ltd')).toBe('pune castings')
    expect(normaliseCompany('Pune Castings Limited')).toBe('pune castings')
    expect(normaliseCompany('Chennai EMS LLP')).toBe('chennai ems')
    expect(normaliseCompany('Acme Inc.')).toBe('acme')
    expect(normaliseCompany('Acme, LLC')).toBe('acme')
    expect(normaliseCompany('Acme Incorporated')).toBe('acme')
  })

  it('keeps words like Industries', () => {
    expect(normaliseCompany('Sundaram Industries Pvt Ltd')).toBe('sundaram industries')
    expect(normaliseCompany('Bharat Forge')).toBe('bharat forge')
  })

  it('normalises ampersands, case and spacing', () => {
    expect(normaliseCompany('Larsen & Toubro Limited')).toBe('larsen and toubro')
    expect(normaliseCompany('  KAVERI   Plastics  ')).toBe('kaveri plastics')
  })

  it('keeps a name made only of a suffix', () => {
    expect(normaliseCompany('Limited')).toBe('limited')
    expect(normaliseCompany('')).toBe('')
  })
})

describe('searchTokens', () => {
  it('splits into lowercase accent-free words', () => {
    expect(searchTokens('Hosur Precision-Forge')).toEqual(['hosur', 'precision', 'forge'])
    expect(searchTokens('rohan@hpf.example')).toEqual(['rohan', 'hpf', 'example'])
    expect(searchTokens('Zoë, Zoe and ZOE')).toEqual(['zoe', 'and'])
    expect(searchTokens('+91 98450 12345')).toEqual(['91', '98450', '12345'])
    expect(searchTokens('  ')).toEqual([])
  })
})

describe('initials', () => {
  it('uses first and last names', () => {
    expect(initials('Rohan Mehta')).toBe('RM')
    expect(initials('Cdr Arvind Menon')).toBe('AM')
    expect(initials('Dr. A. Kumar')).toBe('AK')
    expect(initials('rohan kumar mehta')).toBe('RM')
  })

  it('uses two letters of a single name', () => {
    expect(initials('Dhruv')).toBe('DH')
    expect(initials('A')).toBe('A')
    expect(initials('Dr')).toBe('DR')
  })

  it('falls back to a question mark', () => {
    expect(initials('')).toBe('?')
    expect(initials('  -- ')).toBe('?')
  })
})
