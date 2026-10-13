// Reading, upgrading and writing calendars.json, and every change made to it.
// A change is a pure function from one document to the next, so it can be
// applied again on a fresh copy when the file moved under us (see state/store.ts).

import { BUILT_IN_CATEGORIES, categoriesOf, categoryById, guessCategory } from './categories';
import { CALENDAR_PALETTE, calendarColor, isHex, titleKey } from './colors';
import { dayNumber, minuteOfDay } from './dates';
import { shiftRule } from './recurrence';
import type { CalendarDoc, StoredCalendar, StoredCategory, StoredEvent } from './types';

/** Layout version this build writes. 2 added categories and second colours. */
export const SCHEMA = 2;

let counter = 0;
export function uid(): string {
  return `kx-${Date.now()}-${counter++}-${Math.random().toString(36).slice(2, 7)}`;
}

/** Minutes as a number, also when a hand-edited file holds them as text; anything else is "no reminder". */
function alarmOf(value: unknown): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  return '';
}

/**
 * Whether a parsed file has the shape of calendars.json at all. Valid JSON of
 * another shape is somebody else's file, or a damaged one: not ours to read as
 * "no calendars" and then save over.
 */
export function looksLikeCalendars(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true; // no file yet
  if (typeof raw !== 'object' || Array.isArray(raw)) return false;
  const calendars = (raw as Record<string, unknown>).calendars;
  return calendars === undefined || Array.isArray(calendars);
}

/** Whatever was in the file, as a document the rest of the app can walk. Nothing is dropped. */
export function parseDoc(raw: unknown): CalendarDoc {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const calendars = Array.isArray(source.calendars) ? source.calendars : [];
  return {
    ...source,
    calendars: calendars
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c, i) => ({
        ...c,
        // Something without an id gets one from where it is, so it is the same on every read.
        id: typeof c.id === 'string' && c.id ? c.id : `kx-calendar-${i}`,
        name: typeof c.name === 'string' ? c.name : '',
        color: typeof c.color === 'string' ? c.color : '',
        visible: c.visible !== false,
        events: (Array.isArray(c.events) ? c.events : [])
          .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
          .map((e, j) => ({
            ...e,
            uid: typeof e.uid === 'string' && e.uid ? e.uid : `kx-event-${i}-${j}`,
            title: typeof e.title === 'string' ? e.title : String(e.title ?? ''),
            start: String(e.start ?? ''),
            // An event with no usable end ends when it starts.
            end: String(e.end || e.start || ''),
            allDay: !!e.allDay,
            rrule: e.rrule && typeof e.rrule === 'object' ? e.rrule : null,
            exdates: Array.isArray(e.exdates) ? e.exdates.map(String) : [],
            alarmMinutes: alarmOf(e.alarmMinutes),
          })) as StoredEvent[],
      })) as StoredCalendar[],
  };
}

/**
 * Bring an older file up to this build: calendars get the category their name
 * says they are (and with it the category's fixed colour), and a timetable gets
 * a second colour per subject. Returns null when the file is already there.
 */
export function migrate(doc: CalendarDoc): CalendarDoc | null {
  if ((doc.schema ?? 1) >= SCHEMA) return null;
  const categories = categoriesOf(doc);
  const calendars = doc.calendars.map((calendar): StoredCalendar => {
    if (calendar.category !== undefined) return calendar;
    const category = guessCategory(calendar.name, categories);
    if (!category) return calendar;
    return { ...calendar, category: category.id, ...(category.id === 'school' ? { autoAccent: true } : {}) };
  });
  return withColors({ ...doc, schema: SCHEMA, calendars });
}

/** Keep the colour fields other readers of the file use equal to what we draw. */
export function withColors(doc: CalendarDoc): CalendarDoc {
  const categories = categoriesOf(doc);
  return {
    ...doc,
    calendars: doc.calendars.map((calendar) => {
      const color = calendarColor(calendar, categories);
      const custom = categoryById(categories, calendar.category) ? color : calendar.customColor;
      return calendar.color === color && calendar.customColor === custom ? calendar : { ...calendar, color, customColor: custom };
    }),
  };
}

/** The file as text, laid out as the first Kalendarix wrote it (JSON, two spaces). */
export function serialize(doc: CalendarDoc): string {
  return JSON.stringify(withColors(doc), null, 2);
}

// ---------------------------------------------------------------------------
// changes
// ---------------------------------------------------------------------------

export type Change = (doc: CalendarDoc) => CalendarDoc;

function mapCalendar(doc: CalendarDoc, calId: string, fn: (c: StoredCalendar) => StoredCalendar): CalendarDoc {
  return { ...doc, calendars: doc.calendars.map((c) => (c.id === calId ? fn(c) : c)) };
}

export interface EventDraft {
  uid?: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  notes: string;
  rrule: StoredEvent['rrule'];
  alarmMinutes: number | '';
  category?: string;
  accent?: string;
}

/** An instant moved by whole days, keeping its time of day across a clock change. */
function shiftDays(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) || !days) return iso;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()).toISOString();
}

function fromDraft(draft: EventDraft, previous?: StoredEvent): StoredEvent {
  // When a series is given another start day, the days taken out of it move along.
  const before = previous ? Date.parse(previous.start) : NaN;
  const days = Number.isNaN(before) ? 0 : dayNumber(draft.start) - dayNumber(before);
  const event: StoredEvent = {
    ...previous,
    uid: draft.uid ?? previous?.uid ?? uid(),
    title: draft.title.trim(),
    // Two names for one text: older files and other readers of the file use either.
    description: draft.notes,
    notes: draft.notes,
    location: draft.location.trim(),
    start: draft.start.toISOString(),
    end: draft.end.toISOString(),
    allDay: draft.allDay,
    // Parts of the rule the form has no field for (the weekdays of a weekly rule) follow the new day too.
    rrule: days ? shiftRule(draft.rrule, before, draft.start.getTime()) : draft.rrule,
    exdates: (previous?.exdates ?? []).map((d) => shiftDays(d, days)),
    alarmMinutes: draft.alarmMinutes,
  };
  if (draft.category) event.category = draft.category;
  else delete event.category;
  if (isHex(draft.accent)) event.accent = draft.accent;
  else delete event.accent;
  return event;
}

export function addEvent(calId: string, draft: EventDraft): Change {
  // Made once: a change may run again on a newer file and must add the same event.
  const event = fromDraft(draft);
  return (doc) => mapCalendar(doc, calId, (c) => ({ ...c, events: [...c.events, event] }));
}

/** Rewrite an event, moving it to another calendar when asked. */
export function updateEvent(calId: string, eventUid: string, draft: EventDraft, toCalId = calId): Change {
  return (doc) => {
    const previous = doc.calendars.find((c) => c.id === calId)?.events.find((e) => e.uid === eventUid);
    if (!previous) return doc;
    const next = fromDraft({ ...draft, uid: eventUid }, previous);
    if (toCalId === calId || !doc.calendars.some((c) => c.id === toCalId)) {
      return mapCalendar(doc, calId, (c) => ({ ...c, events: c.events.map((e) => (e.uid === eventUid ? next : e)) }));
    }
    const removed = mapCalendar(doc, calId, (c) => ({ ...c, events: c.events.filter((e) => e.uid !== eventUid) }));
    return mapCalendar(removed, toCalId, (c) => ({ ...c, events: [...c.events, next] }));
  };
}

export function deleteEvent(calId: string, eventUid: string): Change {
  return (doc) => mapCalendar(doc, calId, (c) => ({ ...c, events: c.events.filter((e) => e.uid !== eventUid) }));
}

/** Take one occurrence out of a repeating event; the rest of the series stays. */
export function deleteOccurrence(calId: string, eventUid: string, occurrenceStart: number): Change {
  return (doc) =>
    mapCalendar(doc, calId, (c) => ({
      ...c,
      events: c.events.map((e) =>
        e.uid === eventUid ? { ...e, exdates: [...(e.exdates ?? []), new Date(occurrenceStart).toISOString()] } : e,
      ),
    }));
}

/**
 * An event moved so that the occurrence that began at `from` begins at `to`.
 *
 * It moves by days and by the clock, not by milliseconds: a daily 08:00 stays at
 * 08:00 on both sides of a clock change. A whole-day event only changes its day.
 * A repeating event moves as a whole: every occurrence shifts the same way, the
 * days taken out of the series move with it, and a weekly rule's weekdays follow.
 */
export function moved(event: StoredEvent, from: number, to: number): StoredEvent {
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return event;
  const endRaw = new Date(event.end);
  const end = Number.isNaN(endRaw.getTime()) ? start : endRaw;
  const days = dayNumber(to) - dayNumber(from);
  const minutes = event.allDay ? 0 : minuteOfDay(to) - minuteOfDay(from);
  if (!days && !minutes) return event;

  const shifted = (d: Date): Date =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes() + minutes, d.getSeconds(), d.getMilliseconds());
  const newStart = shifted(start);
  // A whole-day event keeps the days it covers; a timed one keeps its length.
  const newEnd = event.allDay ? shifted(end) : new Date(newStart.getTime() + (end.getTime() - start.getTime()));
  return {
    ...event,
    start: newStart.toISOString(),
    end: newEnd.toISOString(),
    rrule: shiftRule(event.rrule, start.getTime(), newStart.getTime()),
    exdates: (event.exdates ?? []).map((d) => shiftDays(d, days)),
  };
}

export function moveEvent(calId: string, eventUid: string, from: number, to: number): Change {
  return (doc) => mapCalendar(doc, calId, (c) => ({ ...c, events: c.events.map((e) => (e.uid === eventUid ? moved(e, from, to) : e)) }));
}

export function nextCalendarColor(doc: CalendarDoc): string {
  const categories = categoriesOf(doc);
  const used = new Set(doc.calendars.map((c) => calendarColor(c, categories).toLowerCase()));
  return CALENDAR_PALETTE.find((c) => !used.has(c)) ?? CALENDAR_PALETTE[doc.calendars.length % CALENDAR_PALETTE.length];
}

export function addCalendar(calendar: Pick<StoredCalendar, 'id' | 'name'> & Partial<StoredCalendar>): Change {
  return (doc) => ({
    ...doc,
    calendars: [
      ...doc.calendars,
      { color: nextCalendarColor(doc), customColor: null, visible: true, events: [], ...calendar },
    ],
  });
}

export function updateCalendar(calId: string, patch: Partial<StoredCalendar>): Change {
  return (doc) => mapCalendar(doc, calId, (c) => ({ ...c, ...patch }));
}

export function deleteCalendar(calId: string): Change {
  return (doc) => ({ ...doc, calendars: doc.calendars.filter((c) => c.id !== calId) });
}

/** What the file keeps under "categories", whatever shape somebody left it in. */
function storedCategories(doc: CalendarDoc): StoredCategory[] {
  return Array.isArray(doc.categories) ? doc.categories : [];
}

/** A category of the user's own. Its id is made once (categoryId), so a replayed change adds the same one. */
export function addCategory(category: StoredCategory): Change {
  return (doc) => (storedCategories(doc).some((c) => c?.id === category.id) ? doc : { ...doc, categories: [...storedCategories(doc), category] });
}

/** Rename or recolour a category of the user's own; everything of that kind follows. */
export function updateCategory(id: string, patch: Partial<Pick<StoredCategory, 'name' | 'color'>>): Change {
  return (doc) => {
    const current = categoriesOf(doc).get(id);
    if (!current?.own) return doc;
    const stored = storedCategories(doc);
    const next = { id, name: current.name ?? id, color: current.color, ...patch };
    // One that so far only a calendar spoke of is written down here for the first time.
    const categories = stored.some((c) => c?.id === id) ? stored.map((c) => (c?.id === id ? { ...c, ...next } : c)) : [...stored, next];
    return { ...doc, categories };
  };
}

/** Remove a category of the user's own. What was of that kind keeps its colour, now as a colour of its own. */
export function deleteCategory(id: string): Change {
  return (doc) => {
    const category = categoriesOf(doc).get(id);
    if (!category?.own) return doc;
    const stored = Array.isArray(doc.categories) ? { categories: doc.categories.filter((c) => c?.id !== id) } : {};
    // One that stood in for a category that comes with the app gives the place back; nothing was of a kind that is gone.
    if (BUILT_IN_CATEGORIES.has(id)) return { ...doc, ...stored };
    const without = (event: StoredEvent): StoredEvent => {
      if (event.category !== id) return event;
      const rest = { ...event };
      delete rest.category;
      return rest;
    };
    return {
      ...doc,
      ...stored,
      calendars: doc.calendars.map((calendar) => {
        const events = calendar.events.some((e) => e.category === id) ? calendar.events.map(without) : calendar.events;
        if (calendar.category !== id) return events === calendar.events ? calendar : { ...calendar, events };
        return { ...calendar, category: '', color: category.color, customColor: category.color, events };
      }),
    };
  };
}

/** Pin the second colour of every event with this title, or unpin it with null. */
export function setAccent(calId: string, title: string, color: string | null): Change {
  return (doc) =>
    mapCalendar(doc, calId, (c) => {
      const accents = { ...c.accents };
      if (color) accents[titleKey(title)] = color;
      else delete accents[titleKey(title)];
      return { ...c, accents };
    });
}

/** Put a fresh download of a subscribed feed in place of the last one; events added by hand stay. */
export function replaceRemote(calId: string, events: StoredEvent[]): Change {
  return (doc) =>
    mapCalendar(doc, calId, (c) => ({
      ...c,
      events: [...c.events.filter((e) => e.remote !== true), ...events.map((e) => ({ ...e, remote: true }))],
    }));
}

export function importCalendars(calendars: { name: string; events: StoredEvent[]; sourceUrl?: string }[]): Change {
  const ids = calendars.map(() => uid());
  return (doc) => {
    let next = doc;
    for (const [i, incoming] of calendars.entries()) {
      const category = guessCategory(incoming.name, categoriesOf(next));
      next = addCalendar({
        id: ids[i],
        name: incoming.name,
        events: incoming.events,
        ...(incoming.sourceUrl ? { sourceUrl: incoming.sourceUrl } : {}),
        ...(category ? { category: category.id } : {}),
      })(next);
    }
    return next;
  };
}
