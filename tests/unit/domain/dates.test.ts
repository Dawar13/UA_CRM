import { afterEach, describe, expect, it } from 'vitest'
import {
  addDaysIso,
  compareFuzzy,
  daysBetween,
  daysInMonth,
  exactDate,
  formatDate,
  formatDayHeading,
  formatFullDate,
  formatFuzzyDate,
  formatTime,
  IST,
  IST_OFFSET_MINUTES,
  isIsoDate,
  isOverdue,
  isToday,
  istDateOf,
  istInstant,
  parseFuzzyDate,
  parseIsoDate,
  parseNaturalDate,
  periodEnd,
  relative,
  sortKey,
  todayIst,
  toIsoDate,
  weekdayOf,
} from '@/domain/dates'
import type { FuzzyDate } from '@/domain/types'
import { now } from './_fixtures'

/** 10:00 IST on an IST calendar date. */
function on(date: string): Date {
  return new Date(`${date}T10:00:00+05:30`)
}

const day = (date: string): FuzzyDate => ({ date, precision: 'day' })
const early = (date: string): FuzzyDate => ({ date, precision: 'early-month' })
const mid = (date: string): FuzzyDate => ({ date, precision: 'mid-month' })
const late = (date: string): FuzzyDate => ({ date, precision: 'late-month' })
const month = (date: string): FuzzyDate => ({ date, precision: 'month' })

describe('constants and calendar helpers', () => {
  it('names the IST zone and offset', () => {
    expect(IST).toBe('Asia/Kolkata')
    expect(IST_OFFSET_MINUTES).toBe(330)
  })

  it('validates and splits ISO calendar dates', () => {
    expect(isIsoDate('2026-11-05')).toBe(true)
    expect(isIsoDate('2028-02-29')).toBe(true)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-11-05T00:00:00Z')).toBe(false)
    expect(parseIsoDate('2026-11-05')).toEqual({ year: 2026, month: 11, day: 5 })
    expect(() => parseIsoDate('2026-02-30')).toThrow(RangeError)
    expect(() => parseIsoDate('5 Nov')).toThrow(RangeError)
    expect(toIsoDate(2026, 1, 5)).toBe('2026-01-05')
  })

  it('does calendar arithmetic', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(daysInMonth(2026, 12)).toBe(31)
    expect(daysBetween('2026-11-05', '2026-11-06')).toBe(1)
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11)
    expect(daysBetween('2026-11-05', '2026-10-15')).toBe(-21)
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDaysIso('2028-03-01', -1)).toBe('2028-02-29')
    expect(weekdayOf('2026-11-05')).toBe(4)
  })

  it('builds the UTC instant of an IST wall-clock time', () => {
    expect(istInstant('2026-11-05').toISOString()).toBe('2026-11-04T18:30:00.000Z')
    expect(istInstant('2026-11-06', '16:00').toISOString()).toBe('2026-11-06T10:30:00.000Z')
    expect(() => istInstant('2026-11-06', '4pm')).toThrow(RangeError)
    expect(() => istInstant('nope')).toThrow(RangeError)
  })
})

describe('todayIst and istDateOf', () => {
  it('gives the IST calendar date', () => {
    expect(todayIst(now)).toBe('2026-11-05')
  })

  it('uses IST, not UTC, near midnight', () => {
    // 19:00 UTC on 4 Nov is 00:30 IST on 5 Nov.
    expect(todayIst(new Date('2026-11-04T19:00:00.000Z'))).toBe('2026-11-05')
    expect(todayIst(new Date('2026-11-04T18:29:59.999Z'))).toBe('2026-11-04')
    expect(todayIst(new Date('2026-11-04T18:30:00.000Z'))).toBe('2026-11-05')
  })

  it('accepts instants, ISO strings and plain dates', () => {
    expect(istDateOf(new Date('2026-11-04T19:00:00.000Z'))).toBe('2026-11-05')
    expect(istDateOf('2026-11-04T19:00:00.000Z')).toBe('2026-11-05')
    expect(istDateOf('2026-11-05T00:00:00+05:30')).toBe('2026-11-05')
    expect(istDateOf('2026-11-04')).toBe('2026-11-04')
    expect(() => istDateOf('not a date')).toThrow(RangeError)
  })
})

describe('parseFuzzyDate', () => {
  it('parses early, mid and late months', () => {
    expect(parseFuzzyDate('early Oct', now)).toEqual(early('2026-10-05'))
    expect(parseFuzzyDate('mid Oct', now)).toEqual(mid('2026-10-15'))
    expect(parseFuzzyDate('late Oct', now)).toEqual(late('2026-10-25'))
    expect(parseFuzzyDate('Mid-October', now)).toEqual(mid('2026-10-15'))
    expect(parseFuzzyDate('beginning of Dec', now)).toEqual(early('2026-12-05'))
    expect(parseFuzzyDate('start of Dec', now)).toEqual(early('2026-12-05'))
    expect(parseFuzzyDate('middle of Dec', now)).toEqual(mid('2026-12-15'))
    expect(parseFuzzyDate('end of Nov', now)).toEqual(late('2026-11-25'))
  })

  it('is case- and space-insensitive and ignores a trailing full stop', () => {
    expect(parseFuzzyDate('  MID   oct. ', now)).toEqual(mid('2026-10-15'))
    expect(parseFuzzyDate('Late SEPT', now)).toEqual(late('2026-09-25'))
  })

  it('parses months with and without a year', () => {
    expect(parseFuzzyDate('Oct 2026', now)).toEqual(month('2026-10-01'))
    expect(parseFuzzyDate('October', now)).toEqual(month('2026-10-01'))
    expect(parseFuzzyDate('Oct, 2027', now)).toEqual(month('2027-10-01'))
    expect(parseFuzzyDate('mid Oct 2027', now)).toEqual(mid('2027-10-15'))
    expect(parseFuzzyDate('late Dec 2025', now)).toEqual(late('2025-12-25'))
  })

  it('parses exact day-month dates in several shapes', () => {
    const expected = day('2026-11-12')
    for (const text of [
      '12 Nov',
      'Nov 12',
      '12 Nov 2026',
      'Nov 12, 2026',
      '12th Nov',
      '12 of November',
      '12-Nov-2026',
      '12/11/2026',
      '12.11.2026',
      '12-11-2026',
      '12/11/26',
      '12/11',
      '2026-11-12',
    ]) {
      expect(parseFuzzyDate(text, now), text).toEqual(expected)
    }
  })

  it('infers the nearest year (within six months either side)', () => {
    expect(parseFuzzyDate('mid Oct', now)).toEqual(mid('2026-10-15'))
    expect(parseFuzzyDate('late Dec', on('2027-01-05'))).toEqual(late('2026-12-25'))
    expect(parseFuzzyDate('early Jan', on('2026-12-20'))).toEqual(early('2027-01-05'))
    expect(parseFuzzyDate('3 Jan', on('2026-12-20'))).toEqual(day('2027-01-03'))
    expect(parseFuzzyDate('28 Dec', on('2027-01-05'))).toEqual(day('2026-12-28'))
    expect(parseFuzzyDate('Jan', on('2026-12-20'))).toEqual(month('2027-01-01'))
    // 15 May 2026 is 174 days back; 15 May 2027 is 191 days ahead.
    expect(parseFuzzyDate('May', now)).toEqual(month('2026-05-01'))
    // 15 Apr 2026 is 204 days back; 15 Apr 2027 is 161 days ahead.
    expect(parseFuzzyDate('April', now)).toEqual(month('2027-04-01'))
  })

  it('only picks years where the day exists', () => {
    expect(parseFuzzyDate('29 Feb', on('2027-11-05'))).toEqual(day('2028-02-29'))
    expect(parseFuzzyDate('29 Feb', now)).toBeNull()
    expect(parseFuzzyDate('29 Feb 2028', now)).toEqual(day('2028-02-29'))
  })

  it('returns null for text that is not a date', () => {
    for (const text of [
      '',
      '   ',
      'hello',
      'mid Foo',
      '31 Feb 2026',
      '32 Oct',
      '0 Oct',
      '13/13/2026',
      '12/0/2026',
      'next week',
      'fri 4pm',
    ]) {
      expect(parseFuzzyDate(text, now), text).toBeNull()
    }
  })
})

describe('parseNaturalDate', () => {
  it('parses "fri 4pm" forward from Thursday 10:00 IST to Friday 16:00 IST', () => {
    expect(parseNaturalDate('fri 4pm', now)?.toISOString()).toBe('2026-11-06T10:30:00.000Z')
  })

  it('reads relative and day-first dates in IST', () => {
    expect(parseNaturalDate('tomorrow 9am', now)?.toISOString()).toBe('2026-11-06T03:30:00.000Z')
    expect(parseNaturalDate('today 5pm', now)?.toISOString()).toBe('2026-11-05T11:30:00.000Z')
    expect(istDateOf(parseNaturalDate('12/11/2026', now) ?? '')).toBe('2026-11-12')
  })

  it('returns null when nothing parses', () => {
    expect(parseNaturalDate('', now)).toBeNull()
    expect(parseNaturalDate('send ROI note', now)).toBeNull()
  })
})

describe('exactDate', () => {
  it('wraps an ISO date at day precision', () => {
    expect(exactDate('2026-11-05')).toEqual(day('2026-11-05'))
    expect(() => exactDate('2026-11-31')).toThrow(RangeError)
  })
})

describe('formatFuzzyDate', () => {
  it('formats day precision with the year only when not current', () => {
    expect(formatFuzzyDate(day('2026-11-04'), now)).toBe('4 Nov')
    expect(formatFuzzyDate(day('2025-11-04'), now)).toBe('4 Nov 2025')
    expect(formatFuzzyDate(day('2027-01-12'), now)).toBe('12 Jan 2027')
  })

  it('formats early, mid and late as written', () => {
    expect(formatFuzzyDate(early('2026-10-05'), now)).toBe('Early Oct')
    expect(formatFuzzyDate(mid('2026-10-15'), now)).toBe('Mid Oct')
    expect(formatFuzzyDate(late('2026-10-25'), now)).toBe('Late Oct')
    expect(formatFuzzyDate(mid('2027-10-15'), now)).toBe('Mid Oct 2027')
  })

  it('formats months', () => {
    expect(formatFuzzyDate(month('2026-10-01'), now)).toBe('Oct')
    expect(formatFuzzyDate(month('2025-10-01'), now)).toBe('Oct 2025')
    expect(formatFuzzyDate(month('2026-09-01'), now)).toBe('Sep')
  })

  it('decides the current year in IST', () => {
    // 19:00 UTC on 31 Dec 2026 is already 1 Jan 2027 in IST.
    const newYear = new Date('2026-12-31T19:00:00.000Z')
    expect(formatFuzzyDate(day('2027-01-05'), newYear)).toBe('5 Jan')
    expect(formatFuzzyDate(late('2026-12-25'), newYear)).toBe('Late Dec 2026')
  })
})

describe('formatDate', () => {
  it('formats "5 Nov 2026" by default', () => {
    expect(formatDate('2026-11-05', now)).toBe('5 Nov 2026')
    expect(formatDate('2026-11-05', now, { alwaysYear: true })).toBe('5 Nov 2026')
  })

  it('formats "Thu 5 Nov" with the weekday in the current year', () => {
    expect(formatDate('2026-11-05', now, { weekday: true })).toBe('Thu 5 Nov')
    expect(formatDate('2027-01-01', now, { weekday: true })).toBe('Fri 1 Jan 2027')
    expect(formatDate('2026-11-05', now, { weekday: true, alwaysYear: true })).toBe(
      'Thu 5 Nov 2026',
    )
  })

  it('shows instants on their IST date', () => {
    expect(formatDate(new Date('2026-11-04T19:00:00.000Z'), now)).toBe('5 Nov 2026')
    expect(formatDate('2026-11-04T19:00:00.000Z', now, { weekday: true })).toBe('Thu 5 Nov')
  })
})

describe('formatTime', () => {
  it('formats IST times with lowercase am and pm', () => {
    expect(formatTime('2026-11-06T10:30:00.000Z')).toBe('4:00 pm')
    expect(formatTime(now)).toBe('10:00 am')
    expect(formatTime('2026-11-06T10:35:00.000Z')).toBe('4:05 pm')
    expect(formatTime('2026-11-04T18:30:00.000Z')).toBe('12:00 am')
    expect(formatTime('2026-11-05T06:30:00.000Z')).toBe('12:00 pm')
    expect(() => formatTime('later')).toThrow(RangeError)
  })
})

describe('formatDayHeading', () => {
  it('names today and tomorrow, then weekday dates', () => {
    expect(formatDayHeading('2026-11-05', now)).toBe('Today')
    expect(formatDayHeading('2026-11-06', now)).toBe('Tomorrow')
    expect(formatDayHeading('2026-11-07', now)).toBe('Sat 7 Nov')
    expect(formatDayHeading('2026-11-04', now)).toBe('Wed 4 Nov')
    expect(formatDayHeading('2027-01-04', now)).toBe('Mon 4 Jan 2027')
  })

  it('uses the IST date of now', () => {
    expect(formatDayHeading('2026-11-05', new Date('2026-11-04T19:00:00.000Z'))).toBe('Today')
  })
})

describe('relative', () => {
  it('describes nearby days', () => {
    expect(relative('2026-11-05', now)).toBe('today')
    expect(relative('2026-11-04', now)).toBe('yesterday')
    expect(relative('2026-11-06', now)).toBe('tomorrow')
    expect(relative('2026-11-02', now)).toBe('3 days ago')
    expect(relative('2026-11-08', now)).toBe('in 3 days')
    expect(relative('2026-10-23', now)).toBe('13 days ago')
  })

  it('switches to weeks, months and years', () => {
    expect(relative('2026-10-22', now)).toBe('2 weeks ago')
    expect(relative('2026-11-25', now)).toBe('in 2 weeks')
    expect(relative(addDaysIso('2026-11-05', -59), now)).toBe('8 weeks ago')
    expect(relative(addDaysIso('2026-11-05', -60), now)).toBe('2 months ago')
    expect(relative(addDaysIso('2026-11-05', -95), now)).toBe('3 months ago')
    expect(relative(addDaysIso('2026-11-05', 364), now)).toBe('in 12 months')
    expect(relative(addDaysIso('2026-11-05', -365), now)).toBe('1 year ago')
    expect(relative(addDaysIso('2026-11-05', 800), now)).toBe('in 2 years')
  })

  it('uses the sort date of fuzzy dates and the IST date of instants', () => {
    expect(relative(mid('2026-10-15'), now)).toBe('3 weeks ago')
    expect(relative(early('2026-11-05'), now)).toBe('today')
    expect(relative('2026-11-04T19:00:00.000Z', now)).toBe('today')
  })
})

describe('formatFullDate', () => {
  it('always shows the year', () => {
    expect(formatFullDate('2026-11-04')).toBe('4 Nov 2026')
    expect(formatFullDate(day('2026-11-04'))).toBe('4 Nov 2026')
    expect(formatFullDate(mid('2026-10-15'))).toBe('Mid Oct 2026')
    expect(formatFullDate(early('2026-10-05'))).toBe('Early Oct 2026')
    expect(formatFullDate(late('2026-10-25'))).toBe('Late Oct 2026')
    expect(formatFullDate(month('2026-10-01'))).toBe('Oct 2026')
    expect(formatFullDate('2026-11-04T19:00:00.000Z')).toBe('5 Nov 2026')
  })
})

describe('isOverdue and isToday', () => {
  it('handles day precision', () => {
    expect(isOverdue(day('2026-11-04'), now)).toBe(true)
    expect(isOverdue(day('2026-11-05'), now)).toBe(false)
    expect(isOverdue(day('2026-11-06'), now)).toBe(false)
    expect(isToday(day('2026-11-05'), now)).toBe(true)
    expect(isToday(day('2026-11-04'), now)).toBe(false)
  })

  it('treats early as days 1–10', () => {
    expect(isOverdue(early('2026-11-05'), on('2026-11-10'))).toBe(false)
    expect(isOverdue(early('2026-11-05'), on('2026-11-11'))).toBe(true)
    expect(isOverdue(early('2026-10-05'), now)).toBe(true)
    expect(isToday(early('2026-11-05'), now)).toBe(false)
  })

  it('treats mid as days 11–20', () => {
    expect(isOverdue(mid('2026-11-15'), on('2026-11-20'))).toBe(false)
    expect(isOverdue(mid('2026-11-15'), on('2026-11-21'))).toBe(true)
    expect(isOverdue(mid('2026-10-15'), now)).toBe(true)
    expect(isToday(mid('2026-11-15'), on('2026-11-15'))).toBe(false)
  })

  it('treats late as day 21 to the end of the month', () => {
    expect(isOverdue(late('2026-11-25'), on('2026-11-30'))).toBe(false)
    expect(isOverdue(late('2026-11-25'), on('2026-12-01'))).toBe(true)
    expect(isOverdue(late('2028-02-25'), on('2028-02-29'))).toBe(false)
    expect(isOverdue(late('2028-02-25'), on('2028-03-01'))).toBe(true)
    expect(isToday(late('2026-11-25'), on('2026-11-25'))).toBe(false)
  })

  it('treats month as the whole month', () => {
    expect(isOverdue(month('2026-11-01'), on('2026-11-30'))).toBe(false)
    expect(isOverdue(month('2026-11-01'), on('2026-12-01'))).toBe(true)
    expect(isOverdue(month('2026-10-01'), now)).toBe(true)
    expect(isToday(month('2026-11-01'), on('2026-11-01'))).toBe(false)
  })

  it('compares against the IST date near midnight', () => {
    const justAfterIstMidnight = new Date('2026-11-04T19:00:00.000Z')
    expect(isOverdue(day('2026-11-04'), justAfterIstMidnight)).toBe(true)
    expect(isToday(day('2026-11-05'), justAfterIstMidnight)).toBe(true)
  })

  it('reports period ends', () => {
    expect(periodEnd(day('2026-11-04'))).toBe('2026-11-04')
    expect(periodEnd(early('2026-11-05'))).toBe('2026-11-10')
    expect(periodEnd(mid('2026-11-15'))).toBe('2026-11-20')
    expect(periodEnd(late('2026-11-25'))).toBe('2026-11-30')
    expect(periodEnd(month('2026-02-01'))).toBe('2026-02-28')
  })
})

describe('sortKey and compareFuzzy', () => {
  it('uses the 5th, 15th, 25th and 1st', () => {
    expect(sortKey(day('2026-10-09'))).toBe('2026-10-09')
    expect(sortKey(early('2026-10-05'))).toBe('2026-10-05')
    expect(sortKey(mid('2026-10-15'))).toBe('2026-10-15')
    expect(sortKey(late('2026-10-25'))).toBe('2026-10-25')
    expect(sortKey(month('2026-10-01'))).toBe('2026-10-01')
    // A stored date that drifted from the convention still sorts by its precision.
    expect(sortKey(mid('2026-10-09'))).toBe('2026-10-15')
  })

  it('sorts by date, exact first on ties, nulls last', () => {
    const list: (FuzzyDate | null)[] = [
      null,
      late('2026-10-25'),
      day('2026-10-05'),
      month('2026-11-01'),
      early('2026-10-05'),
      day('2026-10-16'),
      mid('2026-10-15'),
      null,
    ]
    expect([...list].sort(compareFuzzy)).toEqual([
      day('2026-10-05'),
      early('2026-10-05'),
      mid('2026-10-15'),
      day('2026-10-16'),
      late('2026-10-25'),
      month('2026-11-01'),
      null,
      null,
    ])
    expect(compareFuzzy(null, null)).toBe(0)
    expect(compareFuzzy(day('2026-10-05'), day('2026-10-05'))).toBe(0)
    expect(compareFuzzy(null, day('2026-10-05'))).toBeGreaterThan(0)
    expect(compareFuzzy(day('2026-10-05'), null)).toBeLessThan(0)
  })
})

describe('independence from the process time zone', () => {
  const original = process.env.TZ

  afterEach(() => {
    process.env.TZ = original
  })

  for (const zone of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    it(`gives IST results when the process runs in ${zone}`, () => {
      process.env.TZ = zone
      // Prove the process zone really changed, so the assertions below mean something.
      expect(new Date('2026-11-05T04:30:00.000Z').getTimezoneOffset()).not.toBe(-330)

      const nearMidnight = new Date('2026-11-04T19:00:00.000Z')
      expect(todayIst(nearMidnight)).toBe('2026-11-05')
      expect(istDateOf('2026-11-04T19:00:00Z')).toBe('2026-11-05')
      expect(formatTime('2026-11-06T10:30:00.000Z')).toBe('4:00 pm')
      expect(formatDate(nearMidnight, now, { weekday: true })).toBe('Thu 5 Nov')
      expect(formatDayHeading('2026-11-05', nearMidnight)).toBe('Today')
      expect(isToday(day('2026-11-05'), nearMidnight)).toBe(true)
      expect(isOverdue(day('2026-11-04'), nearMidnight)).toBe(true)
      expect(parseFuzzyDate('late Dec', on('2027-01-05'))).toEqual(late('2026-12-25'))
      expect(parseNaturalDate('fri 4pm', now)?.toISOString()).toBe('2026-11-06T10:30:00.000Z')
      expect(istInstant('2026-11-06', '16:00').toISOString()).toBe('2026-11-06T10:30:00.000Z')
    })
  }
})
