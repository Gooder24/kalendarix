// Categories: kinds of events, each with one colour. A calendar (or a single
// event) that names a category takes its colour from it; nothing else decides
// it, so the same kind of thing looks the same everywhere. A few categories
// come with the app; the rest are the user's own and live in calendars.json.

import type { CalendarDoc, Lang } from './types';

export interface Category {
  id: string;
  color: string;
  /** The name its owner gave it. The categories that come with the app have one per language instead. */
  name?: string;
  sk?: string;
  en?: string;
  /** Recognises a calendar of this kind by its name (see normaliseName). */
  match?: RegExp;
  /** Kept in the file, so it can be renamed, recoloured and removed. */
  own?: boolean;
}

export const BUILT_IN: readonly Category[] = [
  { id: 'school', sk: 'Školské predmety', en: 'School subjects', color: '#4fae6b', match: /predmet|rozvrh|vyuc|subject|timetable|lesson/ },
  { id: 'school-events', sk: 'Školské akcie', en: 'School events', color: '#b9e6a2', match: /skolsk\w* akc|skola akc|school event/ },
  { id: 'tests', sk: 'Testy', en: 'Tests', color: '#e5584f', match: /test|pisomk|skusk|exam|quiz/ },
  { id: 'trips', sk: 'Trips', en: 'Trips', color: '#f0913a', match: /trip|vylet|cest|travel|dovolenk/ },
  { id: 'holidays', sk: 'Prázdniny', en: 'Holidays', color: '#f2d14e', match: /prazd|holiday|vacation|volno/ },
  { id: 'family', sk: 'Rodinné', en: 'Family', color: '#9fd0f5', match: /rodin|family/ },
];

/** The categories one file knows, by id, in the order they are offered. */
export type Categories = ReadonlyMap<string, Category>;

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Every category of a file: the ones that come with the app, then the file's
 * own (which win when they use the same id). A calendar that names a category
 * nobody defines is itself that category, with the calendar's name and colour:
 * a file written when the app knew more categories keeps every one of them.
 */
export function categoriesOf(doc: Pick<CalendarDoc, 'categories' | 'calendars'>): Categories {
  const out = new Map<string, Category>(BUILT_IN.map((c) => [c.id, c]));
  for (const raw of Array.isArray(doc.categories) ? doc.categories : []) {
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id || !HEX.test(String(raw.color))) continue;
    const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : raw.id;
    out.set(raw.id, { id: raw.id, name, color: String(raw.color).toLowerCase(), own: true });
  }
  for (const calendar of doc.calendars) {
    const id = calendar.category;
    if (typeof id !== 'string' || !id || out.has(id)) continue;
    const color = [calendar.customColor, calendar.color].find((c) => typeof c === 'string' && HEX.test(c));
    if (color) out.set(id, { id, name: calendar.name.trim() || id, color: color.toLowerCase(), own: true });
  }
  return out;
}

/** The categories of a file with nothing of its own in it. */
export const BUILT_IN_CATEGORIES: Categories = categoriesOf({ calendars: [] });

export function categoryById(categories: Categories, id: unknown): Category | null {
  return typeof id === 'string' ? (categories.get(id) ?? null) : null;
}

export function categoryName(category: Category, lang: Lang): string {
  return category.name ?? (lang === 'en' ? category.en : category.sk) ?? category.id;
}

/** Lower case, no diacritics, single spaces. */
export function normaliseName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** An id for a new category of this name that no other category has: "Krúžok" → "kruzok". */
export function categoryId(name: string, categories: Categories): string {
  const stem = normaliseName(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'category';
  let id = stem;
  for (let n = 2; categories.has(id); n++) id = `${stem}-${n}`;
  return id;
}

/**
 * The category a calendar of this name most likely is, or null. Names are typed
 * by hand ("Prááázdniny"), so stretched letters are also tried squeezed, and the
 * patterns are stems, not whole words. A category of the user's own is
 * recognised by its very name.
 */
export function guessCategory(name: string, categories: Categories = BUILT_IN_CATEGORIES): Category | null {
  const plain = normaliseName(name);
  if (!plain) return null;
  const squeezed = plain.replace(/(.)\1+/g, '$1');
  const all = [...categories.values()];
  const named = all.find((c) => c.name !== undefined && normaliseName(c.name) === plain);
  if (named) return named;
  // School events before school subjects: both are "školské".
  const first = all.filter((c) => c.id === 'school-events');
  for (const category of [...first, ...all.filter((c) => c.id !== 'school-events')]) {
    if (category.match && (category.match.test(plain) || category.match.test(squeezed))) return category;
  }
  return null;
}
