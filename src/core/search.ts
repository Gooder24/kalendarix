// Finding events by what is written in them. Diacritics do not matter:
// "ucitel" finds "Učiteľ".

import { normaliseName } from './categories';
import type { Instance } from './types';

/** How well a query matches a text: higher is better, -1 is no match. */
export function score(query: string, text: string | undefined): number {
  const needle = normaliseName(query);
  const hay = normaliseName(text ?? '');
  if (!needle) return 0;
  if (!hay) return -1;

  const at = hay.indexOf(needle);
  if (at !== -1) return 1000 - at - (hay.length - needle.length) * 0.1;

  // Otherwise the letters must at least appear in order; runs score higher.
  let from = 0;
  let total = 0;
  let run = 0;
  for (const ch of needle) {
    const found = hay.indexOf(ch, from);
    if (found === -1) return -1;
    if (found === from) total += 5 + ++run;
    else {
      run = 0;
      total += 1;
    }
    from = found + 1;
  }
  return total;
}

/**
 * Best matches first. A repeating event is one result, not one per week: of its
 * occurrences the next upcoming one is kept (or the last one, when all are past).
 */
export function search(query: string, instances: Instance[], now: number, limit = 30): Instance[] {
  if (!query.trim()) return [];
  const best = new Map<string, { inst: Instance; score: number }>();
  for (const inst of instances) {
    const fields: [string | undefined, number][] = [
      [inst.event.title, 3],
      [inst.event.location, 2],
      [inst.event.notes || inst.event.description, 1.5],
      [inst.calendar.name, 1],
    ];
    let value = -1;
    for (const [text, weight] of fields) {
      const s = score(query, text);
      if (s >= 0) value = Math.max(value, s * weight);
    }
    if (value < 0) continue;
    const id = `${inst.calId}|${inst.uid}`;
    const kept = best.get(id);
    if (!kept || closer(inst, kept.inst, now)) best.set(id, { inst, score: value });
  }
  return [...best.values()]
    .sort((a, b) => b.score - a.score || distance(a.inst, now) - distance(b.inst, now))
    .slice(0, limit)
    .map((r) => r.inst);
}

function closer(a: Instance, b: Instance, now: number): boolean {
  const aAhead = a.end >= now;
  const bAhead = b.end >= now;
  if (aAhead !== bAhead) return aAhead;
  return aAhead ? a.start < b.start : a.start > b.start;
}

function distance(inst: Instance, now: number): number {
  return Math.abs(inst.start - now);
}
