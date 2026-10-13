import { describe, expect, it } from 'vitest';
import { hm, ymd } from './dates';
import { occurrences, parseUntil, shiftRule, simpleRepeat } from './recurrence';
import { at, event } from '../test/fixtures';

const days = (list: { start: number }[]): string[] => list.map((o) => ymd(o.start));
const YEAR = [new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime()] as const;

describe('single events', () => {
  it('come back when they overlap the range, the end not counting', () => {
    const e = event({ uid: 'a', start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 9) });
    expect(occurrences(e, new Date(2026, 9, 5).getTime(), new Date(2026, 9, 6).getTime())).toHaveLength(1);
    expect(occurrences(e, new Date(2026, 9, 5, 9).getTime(), new Date(2026, 9, 6).getTime())).toHaveLength(0);
    expect(occurrences(e, new Date(2026, 9, 4).getTime(), new Date(2026, 9, 5, 8).getTime())).toHaveLength(0);
  });

  it('without a length still happen at their moment', () => {
    const e = event({ uid: 'a', start: at(2026, 10, 5, 8), end: at(2026, 10, 5, 8) });
    expect(occurrences(e, new Date(2026, 9, 5).getTime(), new Date(2026, 9, 6).getTime())).toHaveLength(1);
  });

  it('with a date nobody can read are left out rather than crashing', () => {
    expect(occurrences(event({ uid: 'a', start: 'not a date', end: '' }), ...YEAR)).toEqual([]);
  });
});

describe('repeating events', () => {
  it('weekly until a date, skipping an excluded day', () => {
    const e = event({
      uid: 'weekly', start: at(2026, 9, 1, 12), end: at(2026, 9, 1, 13),
      rrule: { FREQ: 'WEEKLY', UNTIL: '20261020T215959Z' }, exdates: [at(2026, 10, 6, 12)],
    });
    expect(days(occurrences(e, ...YEAR))).toEqual(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29', '2026-10-13', '2026-10-20']);
  });

  it('keep their wall-clock time across the clock change', () => {
    const e = event({ uid: 'w', start: at(2026, 10, 19, 8), end: at(2026, 10, 19, 8, 45), rrule: { FREQ: 'WEEKLY' } });
    const got = occurrences(e, new Date(2026, 9, 19).getTime(), new Date(2026, 10, 10).getTime());
    expect(got.map((o) => hm(o.start))).toEqual(['08:00', '08:00', '08:00', '08:00']);
    expect(got.map((o) => (o.end - o.start) / 60000)).toEqual([45, 45, 45, 45]);
  });

  it('on chosen weekdays include the day they start on', () => {
    // Starts on Tuesday 1 September; every other week on Monday and Wednesday, nine times.
    const e = event({
      uid: 'byday', start: at(2026, 9, 1, 12), end: at(2026, 9, 1, 13),
      rrule: { FREQ: 'WEEKLY', INTERVAL: 2, BYDAY: ['MO', 'WE'], COUNT: 9 },
    });
    expect(days(occurrences(e, ...YEAR))).toEqual([
      '2026-09-02', '2026-09-14', '2026-09-16', '2026-09-28', '2026-09-30', '2026-10-12', '2026-10-14', '2026-10-26', '2026-10-28',
    ]);
    const tuesday = event({ uid: 't', start: at(2026, 9, 1, 12), end: at(2026, 9, 1, 13), rrule: { FREQ: 'WEEKLY', BYDAY: ['TU'], COUNT: 2 } });
    expect(days(occurrences(tuesday, ...YEAR))).toEqual(['2026-09-01', '2026-09-08']);
  });

  it('count from their start even when the range begins later', () => {
    const e = event({ uid: 'c', start: at(2026, 1, 1, 10), end: at(2026, 1, 1, 11), rrule: { FREQ: 'DAILY', COUNT: 5 } });
    expect(occurrences(e, new Date(2026, 0, 4).getTime(), new Date(2026, 1, 1).getTime())).toHaveLength(2);
  });

  it('started long ago are found without walking every period', () => {
    const e = event({ uid: 'old', start: at(1990, 3, 3, 7), end: at(1990, 3, 3, 8), rrule: { FREQ: 'DAILY' } });
    const got = occurrences(e, new Date(2026, 9, 12).getTime(), new Date(2026, 9, 15).getTime());
    expect(days(got)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });

  it('yearly whole days stay one day long', () => {
    const e = event({ uid: 'bday', start: at(2020, 10, 25), end: at(2020, 10, 26), allDay: true, rrule: { FREQ: 'YEARLY', INTERVAL: 1 } });
    const got = occurrences(e, new Date(2026, 0, 1).getTime(), new Date(2028, 0, 1).getTime());
    expect(days(got)).toEqual(['2026-10-25', '2027-10-25']);
    // 25 October 2026 is 25 hours long; the event still ends at the next midnight.
    expect(got.map((o) => ymd(o.end))).toEqual(['2026-10-26', '2027-10-26']);
    expect(got.map((o) => hm(o.end))).toEqual(['00:00', '00:00']);
  });

  it('whole days written with hours in them are still whole days', () => {
    // An older Kalendarix saved "all day" on top of 09:00 to 10:00 and left the hours in.
    const one = event({ uid: 'odd', start: at(2026, 9, 12, 9), end: at(2026, 9, 12, 10), allDay: true, rrule: { FREQ: 'YEARLY', INTERVAL: 1 } });
    const got = occurrences(one, new Date(2026, 0, 1).getTime(), new Date(2028, 0, 1).getTime());
    expect(days(got)).toEqual(['2026-09-12', '2027-09-12']);
    expect(got.map((o) => [ymd(o.end), hm(o.end)])).toEqual([['2026-09-13', '00:00'], ['2027-09-13', '00:00']]);

    const three = event({ uid: 'odd3', start: at(2026, 7, 24, 9), end: at(2026, 7, 26, 10), allDay: true });
    const [span] = occurrences(three, ...YEAR);
    expect([ymd(span.start), ymd(span.end), hm(span.end)]).toEqual(['2026-07-24', '2026-07-27', '00:00']);

    const none = event({ uid: 'odd0', start: at(2026, 7, 24, 9), end: at(2026, 7, 24, 9), allDay: true });
    expect(ymd(occurrences(none, ...YEAR)[0].end)).toBe('2026-07-25');
  });

  it('monthly on the 31st skip the shorter months', () => {
    const e = event({ uid: 'm', start: at(2026, 1, 31, 9), end: at(2026, 1, 31, 10), rrule: { FREQ: 'MONTHLY' } });
    expect(days(occurrences(e, ...YEAR))).toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31', '2026-08-31', '2026-10-31', '2026-12-31']);
  });

  it('monthly by weekday and by day of the month', () => {
    const second = event({ uid: 'm', start: at(2026, 1, 13, 9), end: at(2026, 1, 13, 10), rrule: { FREQ: 'MONTHLY', BYDAY: ['2TU'], COUNT: 3 } });
    expect(days(occurrences(second, ...YEAR))).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
    const last = event({ uid: 'm', start: at(2026, 1, 30, 9), end: at(2026, 1, 30, 10), rrule: { FREQ: 'MONTHLY', BYDAY: ['-1FR'], COUNT: 3 } });
    expect(days(occurrences(last, ...YEAR))).toEqual(['2026-01-30', '2026-02-27', '2026-03-27']);
    const dates = event({ uid: 'm', start: at(2026, 1, 1, 9), end: at(2026, 1, 1, 10), rrule: { FREQ: 'MONTHLY', BYMONTHDAY: [1, -1], COUNT: 4 } });
    expect(days(occurrences(dates, ...YEAR))).toEqual(['2026-01-01', '2026-01-31', '2026-02-01', '2026-02-28']);
  });

  it('on 29 February happen in leap years only', () => {
    const e = event({ uid: 'leap', start: at(2024, 2, 29), end: at(2024, 3, 1), allDay: true, rrule: { FREQ: 'YEARLY' } });
    expect(days(occurrences(e, new Date(2024, 0, 1).getTime(), new Date(2029, 0, 1).getTime()))).toEqual(['2024-02-29', '2028-02-29']);
  });

  it('daily on working days only', () => {
    const e = event({ uid: 'work', start: at(2026, 10, 12, 8), end: at(2026, 10, 12, 9), rrule: { FREQ: 'DAILY', BYDAY: ['MO', 'TU', 'WE', 'TH', 'FR'], COUNT: 7 } });
    expect(days(occurrences(e, ...YEAR))).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-19', '2026-10-20']);
  });

  it('the n-th weekday of a month, as Outlook writes it', () => {
    const second = event({ uid: 'p', start: at(2026, 1, 13, 9), end: at(2026, 1, 13, 10), rrule: { FREQ: 'MONTHLY', BYDAY: ['TU'], BYSETPOS: [2], COUNT: 3 } });
    expect(days(occurrences(second, ...YEAR))).toEqual(['2026-01-13', '2026-02-10', '2026-03-10']);
    // An older file keeps a part it did not know as text.
    const lastWorkingDay = event({ uid: 'l', start: at(2026, 1, 30, 9), end: at(2026, 1, 30, 10), rrule: { FREQ: 'MONTHLY', BYDAY: ['MO', 'TU', 'WE', 'TH', 'FR'], BYSETPOS: '-1', COUNT: 3 } });
    expect(days(occurrences(lastWorkingDay, ...YEAR))).toEqual(['2026-01-30', '2026-02-27', '2026-03-31']);
  });

  it('yearly in a named month, on a named weekday', () => {
    // The last Sunday of March and of October: when the clocks change.
    const e = event({ uid: 'dst', start: at(2026, 3, 29), end: at(2026, 3, 30), allDay: true, rrule: { FREQ: 'YEARLY', BYMONTH: [3, 10], BYDAY: ['-1SU'] } });
    expect(days(occurrences(e, new Date(2026, 0, 1).getTime(), new Date(2028, 0, 1).getTime()))).toEqual(['2026-03-29', '2026-10-25', '2027-03-28', '2027-10-31']);
  });

  it('keep the first occurrence of a start that is not on a whole second', () => {
    const start = new Date(2026, 9, 20, 8, 0, 0, 500);
    const e = event({ uid: 'ms', start: start.toISOString(), end: new Date(start.getTime() + 3600000).toISOString(), rrule: { FREQ: 'DAILY', COUNT: 2 } });
    expect(days(occurrences(e, ...YEAR))).toEqual(['2026-10-20', '2026-10-21']);
  });

  it('with a rule nobody can run do not loop forever', () => {
    const e = event({ uid: 'x', start: at(2026, 1, 1), end: at(2026, 1, 1, 1), rrule: { FREQ: 'HOURLY' as never } });
    expect(occurrences(e, ...YEAR)).toEqual([]);
  });
});

describe('UNTIL', () => {
  it('reads the three forms iCalendar writes', () => {
    expect(parseUntil('20261020T215959Z')).toBe(Date.UTC(2026, 9, 20, 21, 59, 59));
    expect(parseUntil('20261020T215959')).toBe(new Date(2026, 9, 20, 21, 59, 59).getTime());
    expect(parseUntil('20261020')).toBe(new Date(2026, 9, 20, 23, 59, 59, 999).getTime());
    expect(parseUntil('rubbish')).toBeNull();
  });
});

describe('a rule whose event moved to another day', () => {
  const monday = new Date(2026, 9, 12, 8).getTime();
  const wednesday = new Date(2026, 9, 14, 8).getTime();

  it('takes its weekdays along', () => {
    expect(shiftRule({ FREQ: 'WEEKLY', BYDAY: ['MO'] }, monday, wednesday)).toEqual({ FREQ: 'WEEKLY', BYDAY: ['WE'] });
    expect(shiftRule({ FREQ: 'WEEKLY', BYDAY: ['MO', 'FR'], INTERVAL: 2 }, wednesday, monday)).toEqual({ FREQ: 'WEEKLY', BYDAY: ['WE', 'SA'], INTERVAL: 2 });
  });

  it('stops naming the day it used to be on', () => {
    expect(shiftRule({ FREQ: 'MONTHLY', BYDAY: ['2MO'], COUNT: 5 }, monday, wednesday)).toEqual({ FREQ: 'MONTHLY', COUNT: 5 });
    expect(shiftRule({ FREQ: 'MONTHLY', BYMONTHDAY: [12] }, monday, wednesday)).toEqual({ FREQ: 'MONTHLY' });
  });

  it('is left alone when only the hour changed, or there is no rule', () => {
    const rule = { FREQ: 'WEEKLY' as const, BYDAY: ['MO'] };
    expect(shiftRule(rule, monday, monday + 3600000)).toBe(rule);
    expect(shiftRule(null, monday, wednesday)).toBeNull();
    expect(shiftRule({ FREQ: 'DAILY', BYDAY: ['MO', 'TU'] }, monday, wednesday)).toEqual({ FREQ: 'DAILY', BYDAY: ['MO', 'TU'] });
  });
});

describe('simpleRepeat', () => {
  it('names the plain rules and calls the rest custom', () => {
    expect(simpleRepeat(null)).toBe('none');
    expect(simpleRepeat({ FREQ: 'WEEKLY', INTERVAL: 1 })).toBe('weekly');
    expect(simpleRepeat({ FREQ: 'WEEKLY', INTERVAL: 2 })).toBe('custom');
    expect(simpleRepeat({ FREQ: 'YEARLY', UNTIL: '20300101' })).toBe('custom');
  });
});
