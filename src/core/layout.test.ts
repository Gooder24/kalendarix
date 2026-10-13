import { describe, expect, it } from 'vitest';
import { dayNumber } from './dates';
import { expand, toBlocks, type Block } from './instances';
import { layoutDay, layoutRow } from './layout';
import { at, calendar, event } from '../test/fixtures';

const RANGE = [new Date(2026, 8, 1).getTime(), new Date(2026, 11, 1).getTime()] as const;
const monday = dayNumber(new Date(2026, 9, 5));

function blocks(...events: ReturnType<typeof event>[]): Block[] {
  return toBlocks(expand({ calendars: [calendar({ id: 'c', name: 'c', events })] }, ...RANGE));
}
const allDay = (uid: string, from: number, to: number): ReturnType<typeof event> =>
  event({ uid, start: at(2026, 10, from), end: at(2026, 10, to + 1), allDay: true });
const timed = (uid: string, day: number, h1: number, m1: number, h2: number, m2: number): ReturnType<typeof event> =>
  event({ uid, start: at(2026, 10, day, h1, m1), end: at(2026, 10, day, h2, m2) });

describe('a row of days', () => {
  it('draws an event of several days as one bar, not one label per day', () => {
    const { placed } = layoutRow(blocks(allDay('kurz', 6, 8)), monday, 7);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ col: 1, span: 3, lane: 0, continuesBefore: false, continuesAfter: false });
  });

  it('cuts a bar at the edges of the week and says it goes on', () => {
    const long = blocks(allDay('camp', 2, 14));
    expect(layoutRow(long, monday, 7).placed[0]).toMatchObject({ col: 0, span: 7, continuesBefore: true, continuesAfter: true });
    expect(layoutRow(long, monday + 7, 7).placed[0]).toMatchObject({ col: 0, span: 3, continuesBefore: true, continuesAfter: false });
    expect(layoutRow(long, monday - 7, 7).placed[0]).toMatchObject({ col: 4, span: 3, continuesBefore: false, continuesAfter: true });
  });

  it('keeps a bar on one lane for its whole length and stacks what overlaps it', () => {
    const { placed, lanes } = layoutRow(blocks(allDay('a', 5, 9), allDay('b', 7, 8), allDay('c', 10, 11), timed('d', 7, 8, 0, 9, 0)), monday, 7);
    const lane = Object.fromEntries(placed.map((p) => [p.block.head.uid, p.lane]));
    expect(lane).toEqual({ a: 0, b: 1, c: 0, d: 2 });
    expect(lanes).toBe(3);
  });

  it('lets single-day events use the space beside a bar', () => {
    const { placed } = layoutRow(blocks(allDay('bar', 5, 6), timed('x', 8, 8, 0, 9, 0)), monday, 7);
    expect(placed.find((p) => p.block.head.uid === 'x')).toMatchObject({ col: 3, lane: 0 });
  });

  it('gives a timed event that crosses midnight both of its days', () => {
    const night = blocks(event({ uid: 'night', start: at(2026, 10, 6, 22), end: at(2026, 10, 7, 2) }));
    expect(layoutRow(night, monday, 7).placed[0]).toMatchObject({ col: 1, span: 2 });
  });

  it('counts what does not fit, per day, and frees a line for the marker', () => {
    const busy = blocks(timed('a', 6, 8, 0, 9, 0), timed('b', 6, 9, 0, 10, 0), timed('c', 6, 10, 0, 11, 0), timed('d', 6, 11, 0, 12, 0), timed('e', 7, 8, 0, 9, 0));
    const { placed, hidden } = layoutRow(busy, monday, 7, 3);
    expect(hidden).toEqual([0, 2, 0, 0, 0, 0, 0]);
    expect(placed.map((p) => p.block.head.uid).sort()).toEqual(['a', 'b', 'e']);
    expect(layoutRow(busy, monday, 7, 4).hidden[1]).toBe(0);
  });

  it('ignores what lies outside the row', () => {
    expect(layoutRow(blocks(allDay('later', 20, 21)), monday, 7).placed).toEqual([]);
  });
});

describe('the hours of a day', () => {
  const tuesday = monday + 1;

  it('puts overlapping events side by side', () => {
    const slots = layoutDay(blocks(timed('a', 6, 9, 0, 10, 0), timed('b', 6, 9, 30, 10, 30)), tuesday);
    expect(slots.map((s) => [s.block.head.uid, s.col, s.cols])).toEqual([['a', 0, 2], ['b', 1, 2]]);
    expect(slots[0]).toMatchObject({ top: 540, height: 60 });
  });

  it('does not squeeze an event that overlaps nothing', () => {
    const slots = layoutDay(blocks(timed('a', 6, 9, 0, 10, 0), timed('b', 6, 9, 30, 10, 30), timed('alone', 6, 15, 0, 16, 0)), tuesday);
    expect(slots.find((s) => s.block.head.uid === 'alone')).toMatchObject({ col: 0, cols: 1, width: 1 });
  });

  it('reuses a column once it is free, and widens into empty ones', () => {
    const slots = layoutDay(blocks(timed('long', 6, 9, 0, 12, 0), timed('early', 6, 9, 0, 10, 0), timed('late', 6, 10, 0, 11, 0), timed('third', 6, 9, 15, 9, 45)), tuesday);
    const by = Object.fromEntries(slots.map((s) => [s.block.head.uid, s]));
    expect(by.late.col).toBe(by.early.col);
    expect(by.third.col).toBe(2);
    expect(by.late.width).toBe(2); // nothing on its right once "third" is over
    expect(by.long.cols).toBe(3);
  });

  it('cuts an event that crosses midnight to the day shown', () => {
    const night = blocks(event({ uid: 'night', start: at(2026, 10, 6, 22), end: at(2026, 10, 7, 2) }));
    expect(layoutDay(night, tuesday)[0]).toMatchObject({ top: 1320, height: 120, continuesBefore: false, continuesAfter: true });
    expect(layoutDay(night, tuesday + 1)[0]).toMatchObject({ top: 0, height: 120, continuesBefore: true, continuesAfter: false });
  });

  it('draws an event at the hour the clock shows, also on the days the clocks change', () => {
    // Sunday 25 October 2026 has 25 hours, Sunday 29 March has 23; the grid has 24 rows on both.
    for (const [month, date] of [[10, 25], [3, 29]] as const) {
      const sunday = dayNumber(new Date(2026, month - 1, date));
      const list = toBlocks(expand({ calendars: [calendar({ id: 'c', name: 'c', events: [
        event({ uid: 'ten', start: at(2026, month, date, 10), end: at(2026, month, date, 11) }),
        event({ uid: 'late', start: at(2026, month, date, 23), end: at(2026, month, date + 1, 0) }),
      ] })] }, new Date(2026, 0, 1).getTime(), new Date(2027, 0, 1).getTime()));
      const by = Object.fromEntries(layoutDay(list, sunday).map((slot) => [slot.block.head.uid, slot]));
      expect(by.ten).toMatchObject({ top: 600, height: 60 });
      expect(by.late).toMatchObject({ top: 1380, height: 60 });
    }
  });

  it('keeps short events tall enough to read, and leaves bars to the row above', () => {
    const slots = layoutDay(blocks(timed('blink', 6, 9, 0, 9, 5), allDay('bar', 6, 6)), tuesday);
    expect(slots).toHaveLength(1);
    expect(slots[0].height).toBe(20);
  });
});
