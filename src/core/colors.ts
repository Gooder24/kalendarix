// What colour things are. An event has one or two colours: the colour of its
// category (or calendar), and optionally a second one of its own, so that every
// school subject is "school" and still tells itself apart from the others.

import { categoryById, normaliseName, type Categories } from './categories';
import type { StoredCalendar, StoredEvent } from './types';

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);

export const FALLBACK_COLOR = '#628790';

/** Colours handed out to calendars that have no category, in this order. */
export const CALENDAR_PALETTE = ['#628790', '#d98cb3', '#7fb8a4', '#c9a26b', '#8fa3d9', '#c98f7a', '#9ab86a', '#b79ad6'];

/** Colours offered for a category of the user's own; none of them is taken by a category that comes with the app. */
export const CATEGORY_PALETTE = ['#a374e0', '#2f55b0', '#a8713f', '#6e4526', '#e06c9f', '#3aa6b9', '#7d8a2e', '#8d99ae'];

/** Second colours given out automatically; kept apart from each other in hue. */
export const ACCENT_PALETTE = [
  '#7fb3ff', '#ffb86b', '#ff8fa3', '#c49bff', '#5fd4c8', '#ffe07a', '#ff9de1', '#6fd0ff',
  '#e6a37a', '#b9c2ff', '#d8e56a', '#f58f6c', '#8ee3d0', '#d0a4e8', '#c9b68a', '#9be37a',
];

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Black or white, whichever reads better on the colour. */
export function textOn(hex: string): string {
  return luminance(hex) > 0.179 ? '#000000' : '#ffffff';
}

/** A solid colour part of the way from a to b; themes here use no transparency. */
export function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return toHex(ar + (br - ar) * amount, ag + (bg - ag) * amount, ab + (bb - ab) * amount);
}

function distance(a: string, b: string): number {
  const [ar, ag, ab] = rgb(a);
  const [br, bg, bb] = rgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

/** The colour a calendar is drawn in: its category's, else its own. */
export function calendarColor(calendar: StoredCalendar, categories: Categories): string {
  const category = categoryById(categories, calendar.category);
  if (category) return category.color;
  if (isHex(calendar.customColor)) return calendar.customColor;
  if (isHex(calendar.color)) return calendar.color;
  return FALLBACK_COLOR;
}

/** First colour of an event: its own category wins over the calendar's. */
export function eventColor(calendar: StoredCalendar, event: StoredEvent, categories: Categories): string {
  return categoryById(categories, event.category)?.color ?? calendarColor(calendar, categories);
}

/** What makes two events "the same thing" for colouring: the title, less the noise. */
export function titleKey(title: string): string {
  return normaliseName(title.replace(/^\s*(zrušené|zrusene|cancelled|canceled)\s*:\s*/i, ''));
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * A second colour for every distinct title of a calendar. A title keeps its
 * colour as long as the set of titles stays the same; two titles share a colour
 * only once there are more titles than colours.
 */
export function autoAccents(calendar: StoredCalendar, categories: Categories): Map<string, string> {
  const base = calendarColor(calendar, categories);
  // A second colour that looks like the first would not be a second colour.
  const palette = ACCENT_PALETTE.filter((c) => distance(c, base) > 70);
  const keys = [...new Set(calendar.events.map((e) => titleKey(e.title)))].filter(Boolean).sort();
  const taken: boolean[] = Array.from({ length: palette.length }, () => false);
  const out = new Map<string, string>();
  for (const key of keys) {
    let slot = hash(key) % palette.length;
    for (let tries = 0; tries < palette.length && taken[slot]; tries++) slot = (slot + 1) % palette.length;
    taken[slot] = true;
    out.set(key, palette[slot]);
    if (taken.every(Boolean)) taken.fill(false);
  }
  return out;
}

/**
 * Second colour of an event, by who knows best: the event itself (a feed can
 * send one), then the colour pinned to its title in the calendar, then an
 * automatic one when the calendar asks for it.
 */
export function eventAccent(calendar: StoredCalendar, event: StoredEvent, auto: Map<string, string> | null): string | null {
  if (isHex(event.accent)) return event.accent.toLowerCase();
  const key = titleKey(event.title);
  const pinned = calendar.accents?.[key];
  if (isHex(pinned)) return pinned.toLowerCase();
  if (calendar.autoAccent && auto) return auto.get(key) ?? null;
  return null;
}
