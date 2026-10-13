// Where blocks go on the grids. Pure geometry: the views only turn these
// numbers into CSS.

import { MS_MINUTE, fromDayNumber, minuteOfDay } from './dates';
import { isBar, isWide, type Block } from './instances';

/** A block placed in a row of days, on one lane. */
export interface Placed {
  block: Block;
  /** Column of the row where it starts, from 0. */
  col: number;
  /** How many columns it covers. */
  span: number;
  lane: number;
  /** The event goes on before the row starts / after it ends. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export interface RowLayout {
  placed: Placed[];
  /** Lanes in use, counting hidden ones. */
  lanes: number;
  /** Per column: how many blocks did not fit under maxLanes. */
  hidden: number[];
}

/**
 * Lay blocks into a row of consecutive days, one lane per line of text. An event
 * that covers several days is one unbroken bar on one lane, so a week-long course
 * is a single stripe rather than five separate labels. Bars are placed first
 * (earliest, then longest), single-day events fill the gaps below and beside them.
 *
 * With maxLanes set, each column keeps at most that many lines; when a column
 * has more, its last line is given up for the "+N" marker and counted in hidden.
 */
export function layoutRow(blocks: Block[], firstDay: number, days: number, maxLanes = Infinity): RowLayout {
  const lastDay = firstDay + days - 1;
  const visible = blocks.filter((b) => b.lastDay >= firstDay && b.firstDay <= lastDay);
  const order = [...visible].sort(
    (a, b) =>
      Number(isWide(b)) - Number(isWide(a)) ||
      Math.max(a.firstDay, firstDay) - Math.max(b.firstDay, firstDay) ||
      b.lastDay - b.firstDay - (a.lastDay - a.firstDay) ||
      Number(b.allDay) - Number(a.allDay) ||
      a.start - b.start ||
      a.head.event.title.localeCompare(b.head.event.title),
  );

  /** occupied[lane][col] */
  const occupied: boolean[][] = [];
  const all: Placed[] = [];
  for (const block of order) {
    const col = Math.max(block.firstDay, firstDay) - firstDay;
    const end = Math.min(block.lastDay, lastDay) - firstDay;
    let lane = 0;
    for (;; lane++) {
      const row = (occupied[lane] ??= Array.from({ length: days }, () => false));
      let free = true;
      for (let c = col; c <= end; c++) if (row[c]) free = false;
      if (free) {
        for (let c = col; c <= end; c++) row[c] = true;
        break;
      }
    }
    all.push({
      block,
      col,
      span: end - col + 1,
      lane,
      continuesBefore: block.firstDay < firstDay,
      continuesAfter: block.lastDay > lastDay,
    });
  }

  const lanes = occupied.length;
  const hidden: number[] = Array.from({ length: days }, () => 0);
  if (lanes <= maxLanes) return { placed: all, lanes, hidden };

  // Which columns overflow, and so lose their last line to the marker.
  const perCol: number[] = Array.from({ length: days }, () => 0);
  for (const p of all) for (let c = p.col; c < p.col + p.span; c++) perCol[c] = Math.max(perCol[c], p.lane + 1);
  const limit = perCol.map((used) => (used > maxLanes ? maxLanes - 1 : maxLanes));

  const placed: Placed[] = [];
  for (const p of all) {
    let fits = true;
    for (let c = p.col; c < p.col + p.span; c++) if (p.lane >= limit[c]) fits = false;
    if (fits) placed.push(p);
    else for (let c = p.col; c < p.col + p.span; c++) hidden[c]++;
  }
  return { placed, lanes, hidden };
}

/** A timed block cut to one day and given a column among the blocks it overlaps. */
export interface Slot {
  block: Block;
  /** Minutes from the day's midnight. */
  top: number;
  height: number;
  col: number;
  /** Columns in its group of overlapping blocks. */
  cols: number;
  /** How many of those columns it may take (it widens into free ones on its right). */
  width: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Shortest a block is drawn, so a five-minute event can still be read and clicked. */
export const MIN_SLOT_MINUTES = 20;

/**
 * Timed blocks of one day, side by side where they overlap. Blocks that touch
 * each other in a chain share a group, and each group is as wide as the column:
 * a clash at ten o'clock does not squeeze the lone event at three.
 */
export function layoutDay(blocks: Block[], day: number): Slot[] {
  const dayStart = fromDayNumber(day).getTime();
  const dayEnd = fromDayNumber(day + 1).getTime();

  const slots: Slot[] = blocks
    .filter((b) => !isBar(b) && b.firstDay <= day && b.lastDay >= day)
    .map((block) => {
      // Where the clock says, not how long since midnight: the grid has 24 rows
      // also on the days that are 23 or 25 hours long.
      const top = block.start < dayStart ? 0 : minuteOfDay(block.start);
      const bottom = block.end >= dayEnd ? 24 * 60 : minuteOfDay(block.end);
      return {
        block,
        top,
        height: Math.max(MIN_SLOT_MINUTES, bottom - top),
        col: 0,
        cols: 1,
        width: 1,
        continuesBefore: block.start < dayStart,
        continuesAfter: block.end > dayEnd,
      };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  let group: Slot[] = [];
  let groupEnd = -Infinity;
  const close = (): void => {
    const cols = Math.max(...group.map((s) => s.col)) + 1;
    for (const slot of group) {
      slot.cols = cols;
      // Widen into the columns on the right that nothing in this group blocks.
      let width = 1;
      for (let c = slot.col + 1; c < cols; c++) {
        const blocked = group.some((o) => o.col === c && o.top < slot.top + slot.height && o.top + o.height > slot.top);
        if (blocked) break;
        width++;
      }
      slot.width = width;
    }
    group = [];
  };

  for (const slot of slots) {
    if (group.length && slot.top >= groupEnd) close();
    const ends: number[] = [];
    for (const other of group) ends[other.col] = Math.max(ends[other.col] ?? 0, other.top + other.height);
    let col = 0;
    while (ends[col] !== undefined && ends[col] > slot.top) col++;
    slot.col = col;
    group.push(slot);
    groupEnd = Math.max(groupEnd, slot.top + slot.height);
  }
  if (group.length) close();
  return slots;
}

/** Number of days a block covers. */
export function spanDays(block: Block): number {
  return block.lastDay - block.firstDay + 1;
}

/** Length of a timed block in minutes. */
export function minutes(block: Block): number {
  return Math.round((block.end - block.start) / MS_MINUTE);
}
