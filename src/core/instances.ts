// From the stored calendars to what a view draws: every occurrence in a range,
// with its colours worked out.

import { categoriesOf } from './categories';
import { autoAccents, eventAccent, eventColor } from './colors';
import { MS_DAY, MS_MINUTE, dayNumber } from './dates';
import { occurrences } from './recurrence';
import type { CalendarDoc, Instance, StoredCalendar, StoredEvent } from './types';

/**
 * Events another program owns and will overwrite: what a subscribed feed
 * delivered, and what a sync program writes. Such a program says so by its
 * name: the id of its calendar begins with the name and the uid of every event
 * it owns ends in it ("timetable-school" and "…@timetable"). An event added by
 * hand to such a calendar is the user's own.
 */
export function isManaged(event: StoredEvent, calendarId: string): boolean {
  if (event.remote === true) return true;
  const at = event.uid.lastIndexOf('@');
  return at >= 0 && at < event.uid.length - 1 && calendarId.startsWith(`${event.uid.slice(at + 1)}-`);
}

/** A calendar another program fills: a subscribed feed, or one a sync program writes into. */
export function isSynced(calendar: StoredCalendar): boolean {
  return !!calendar.sourceUrl || calendar.events.some((e) => isManaged(e, calendar.id));
}

/** Every occurrence overlapping [from, to), earliest first, whole-day ones leading their day. */
export function expand(doc: CalendarDoc, from: number, to: number, includeHidden = false): Instance[] {
  const out: Instance[] = [];
  const categories = categoriesOf(doc);
  for (const calendar of doc.calendars) {
    if (!includeHidden && calendar.visible === false) continue;
    const auto = calendar.autoAccent ? autoAccents(calendar, categories) : null;
    for (const event of calendar.events) {
      const color = eventColor(calendar, event, categories);
      const accent = eventAccent(calendar, event, auto);
      const managed = isManaged(event, calendar.id);
      for (const { start, end } of occurrences(event, from, to)) {
        out.push({
          key: `${calendar.id}|${event.uid}|${start}`,
          calId: calendar.id,
          uid: event.uid,
          event,
          calendar,
          start,
          end,
          allDay: !!event.allDay,
          recurring: !!event.rrule,
          firstDay: dayNumber(start),
          // The end is not part of the event: one that ends at midnight does not reach into that day.
          lastDay: dayNumber(end > start ? end - 1 : start),
          color,
          accent: accent && accent !== color.toLowerCase() ? accent : null,
          managed,
        });
      }
    }
  }
  return out.sort(byTime);
}

export function byTime(a: Instance, b: Instance): number {
  return a.start - b.start || b.end - a.end || a.event.title.localeCompare(b.event.title);
}

/** Order inside one day: whole-day events first, then by the hour. */
export function byDayOrder(a: Instance, b: Instance): number {
  return (a.allDay ? 0 : 1) - (b.allDay ? 0 : 1) || byTime(a, b);
}

export function onDay(instances: Instance[], day: number): Instance[] {
  return instances.filter((i) => i.firstDay <= day && i.lastDay >= day).sort(byDayOrder);
}

/**
 * Something drawn as one block: an instance, or a run of them that are the same
 * lesson hour after hour. A school day of five identical periods is one thing to
 * look at, not five.
 */
export interface Block {
  key: string;
  /** In time order; one element unless it is a run. */
  parts: Instance[];
  /** The first part, which stands for the whole block. */
  head: Instance;
  start: number;
  end: number;
  allDay: boolean;
  firstDay: number;
  lastDay: number;
  /** A whole day of different lessons folded into one line; see summarise(). */
  summary?: boolean;
}

/** Longest break between two lessons that still reads as "the same thing going on". */
const RUN_GAP = 25 * MS_MINUTE;

function sameLesson(a: Instance, b: Instance): boolean {
  return (
    a.managed && b.managed &&
    a.calId === b.calId &&
    !a.allDay && !b.allDay &&
    a.firstDay === b.firstDay && a.lastDay === a.firstDay && b.lastDay === b.firstDay &&
    a.event.title === b.event.title &&
    (a.event.location ?? '') === (b.event.location ?? '') &&
    a.color === b.color && a.accent === b.accent
  );
}

export function toBlocks(instances: Instance[]): Block[] {
  const blocks: Block[] = [];
  const open = new Map<string, Block>();
  for (const inst of [...instances].sort(byTime)) {
    const runKey = `${inst.calId}|${inst.firstDay}|${inst.event.title}`;
    const run = open.get(runKey);
    const last = run?.parts[run.parts.length - 1];
    if (run && last && sameLesson(last, inst) && inst.start - last.end <= RUN_GAP && inst.start >= last.end) {
      run.parts.push(inst);
      run.end = inst.end;
      continue;
    }
    const block: Block = {
      key: inst.key,
      parts: [inst],
      head: inst,
      start: inst.start,
      end: inst.end,
      allDay: inst.allDay,
      firstDay: inst.firstDay,
      lastDay: inst.lastDay,
    };
    blocks.push(block);
    if (inst.managed) open.set(runKey, block);
  }
  return blocks;
}

/**
 * Belongs in the strip above the hours rather than among them: a whole-day
 * event, or one at least a day long. A night shift from ten to two is neither;
 * it is drawn at its hours on both of its days.
 */
export function isBar(block: Block): boolean {
  return block.allDay || block.end - block.start >= MS_DAY;
}

/** Covers more than one day, so a row of days draws it across them. */
export function isWide(block: Block): boolean {
  return block.allDay || block.lastDay > block.firstDay;
}

/**
 * For a month, where a day is a few lines high: the lessons one feed puts on a
 * day become a single block from the first to the last. Thirty lesson labels a
 * week would bury the handful of things that are not routine.
 */
export function summarise(blocks: Block[]): Block[] {
  const out: Block[] = [];
  const days = new Map<string, Block>();
  for (const block of blocks) {
    if (!block.head.managed || isWide(block)) {
      out.push(block);
      continue;
    }
    const key = `${block.head.calId}|${block.firstDay}`;
    const day = days.get(key);
    if (!day) {
      const copy = { ...block, parts: [...block.parts] };
      days.set(key, copy);
      out.push(copy);
      continue;
    }
    day.parts.push(...block.parts);
    day.start = Math.min(day.start, block.start);
    day.end = Math.max(day.end, block.end);
    day.summary = true;
    day.key = `${key}|summary`;
  }
  for (const day of days.values()) day.parts.sort(byTime);
  return out;
}
