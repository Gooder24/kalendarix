// Reading structure out of an event's free text. Feeds such as a school
// timetable put "Učiteľ: …", "Skupina: …" on lines of the description; shown as
// labelled rows they say far more than a paragraph of small print.

import { normaliseName } from './categories';

export type FieldKind = 'teacher' | 'group' | 'topic' | 'link' | 'other';

export interface Field {
  kind: FieldKind;
  label: string;
  value: string;
}

export interface Details {
  fields: Field[];
  /** What is left once the labelled lines are taken out. */
  notes: string;
}

const KINDS: [FieldKind, RegExp][] = [
  ['teacher', /^(ucitel|ucitelia|vyucujuci|teacher|teachers|lektor)$/],
  ['group', /^(skupina|skupiny|trieda|triedy|group|groups|class|classes)$/],
  ['topic', /^(tema|ucivo|topic|subject)$/],
  ['link', /^(online|link|odkaz|url|meet|zoom|teams)$/],
];

// A label is a word or three, not a sentence, a time ("12:30") or a URL scheme.
const LABELLED = /^\s*([A-Za-zÀ-ž][A-Za-zÀ-ž .\-/]{1,23}):\s+(\S.*)$/;
const URL = /\bhttps?:\/\/[^\s<>"')\]]+/g;

export function parseDetails(text: string | undefined): Details {
  const fields: Field[] = [];
  const rest: string[] = [];
  for (const line of (text ?? '').split(/\r?\n/)) {
    const m = LABELLED.exec(line);
    if (!m || /^https?$/i.test(m[1])) {
      rest.push(line);
      continue;
    }
    const key = normaliseName(m[1]);
    const kind = KINDS.find(([, pattern]) => pattern.test(key))?.[0] ?? (isUrl(m[2]) ? 'link' : 'other');
    fields.push({ kind, label: m[1].trim(), value: m[2].trim() });
  }
  return { fields, notes: rest.join('\n').trim() };
}

export function isUrl(text: string): boolean {
  return /^https?:\/\/\S+$/.test(text.trim());
}

/** Text cut into plain stretches and links, in order. */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(URL)) {
    // Sentence punctuation right after a link is not part of it.
    const href = m[0].replace(/[.,;:!?]+$/, '');
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    out.push({ text: href, href });
    last = m.index + href.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

/** "Zrušené: Matematika" is Matematika that is not happening. */
export function splitCancelled(title: string): { title: string; cancelled: boolean } {
  const m = /^\s*(zrušené|zrusene|cancelled|canceled)\s*:\s*(.*)$/i.exec(title);
  return m ? { title: m[2], cancelled: true } : { title, cancelled: false };
}
