import { describe, expect, it } from 'vitest';
import {
  addDays, addMonths, atMinute, dayNumber, fromDayNumber, hm, parseDate, parseTime, parseYmd, roundedNow,
  startOfWeek, weekNumber, ymd,
} from './dates';

describe('day numbers', () => {
  it('grow by one per local day, also across the clock changes', () => {
    // 29 March 2026 has 23 hours and 25 October 2026 has 25 in Europe/Bratislava.
    for (const [y, m, d] of [[2026, 2, 28], [2026, 9, 24], [2026, 11, 31]]) {
      const day = new Date(y, m, d);
      expect(dayNumber(addDays(day, 1)) - dayNumber(day)).toBe(1);
      expect(dayNumber(new Date(y, m, d, 23, 59)) - dayNumber(day)).toBe(0);
    }
  });

  it('round-trip to local midnight', () => {
    const day = new Date(2026, 9, 25);
    expect(fromDayNumber(dayNumber(day)).getTime()).toBe(day.getTime());
    expect(ymd(fromDayNumber(dayNumber(new Date(2026, 2, 29, 12))))).toBe('2026-03-29');
  });
});

describe('weeks and months', () => {
  it('start the week on Monday', () => {
    expect(ymd(startOfWeek(new Date(2026, 9, 18)))).toBe('2026-10-12'); // a Sunday
    expect(ymd(startOfWeek(new Date(2026, 9, 12)))).toBe('2026-10-12'); // a Monday
  });

  it('number weeks the ISO way', () => {
    expect(weekNumber(new Date(2026, 9, 12))).toBe(42);
    expect(weekNumber(new Date(2026, 0, 1))).toBe(1);
    expect(weekNumber(new Date(2027, 0, 1))).toBe(53); // a Friday: still the last week of 2026
    expect(weekNumber(new Date(2024, 11, 30))).toBe(1); // a Monday: already week 1 of 2025
  });

  it('clamp the day when a month is shorter', () => {
    expect(ymd(addMonths(new Date(2026, 0, 31), 1))).toBe('2026-02-28');
    expect(ymd(addMonths(new Date(2026, 9, 12), -10))).toBe('2025-12-12');
  });
});

describe('what people type', () => {
  it('reads times', () => {
    expect(parseTime('8')).toBe(480);
    expect(parseTime('830')).toBe(510);
    expect(parseTime('8:30')).toBe(510);
    expect(parseTime('08.30')).toBe(510);
    expect(parseTime('1230')).toBe(750);
    expect(parseTime('24:00')).toBe(1440);
    expect(parseTime('25:00')).toBeNull();
    expect(parseTime('8:75')).toBeNull();
    expect(parseTime('soon')).toBeNull();
  });

  it('reads dates', () => {
    expect(ymd(parseDate('23.10.2026', 2026)!)).toBe('2026-10-23');
    expect(ymd(parseDate('23. 10.', 2026)!)).toBe('2026-10-23');
    expect(ymd(parseDate('3.1.27', 2026)!)).toBe('2027-01-03');
    expect(ymd(parseDate('2026-10-23', 2020)!)).toBe('2026-10-23');
    expect(parseDate('31.2.2026', 2026)).toBeNull();
    expect(parseYmd('2026-02-31')).toBeNull();
  });

  it('starts a new event on the next half hour', () => {
    expect(hm(roundedNow(new Date(2026, 9, 12, 14, 7).getTime()))).toBe('14:30');
    expect(hm(roundedNow(new Date(2026, 9, 12, 14, 30).getTime()))).toBe('15:00');
    expect(hm(atMinute(new Date(2026, 9, 12, 18), 510))).toBe('08:30');
  });
});
