// Find an event by typing: Ctrl+K, a few letters, Enter.

import { useMemo, useState } from 'preact/hooks';
import { addDays, hm, startOfDay } from '../core/dates';
import { shortDate } from '../core/i18n';
import { expand, toBlocks } from '../core/instances';
import { search } from '../core/search';
import { detail, doc, lang, now, searchOpen, show, t } from '../state/store';
import { Dialog, paint } from './common';
import { splitCancelled } from '../core/details';
import type { Instance } from '../core/types';

export function SearchPalette() {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState(0);
  // A year back and two ahead: wide enough to find things, narrow enough to stay quick.
  const pool = useMemo(() => expand(doc.value, addDays(now.value, -365).getTime(), addDays(now.value, 730).getTime(), true), [doc.value]);
  const results = useMemo(() => search(query, pool, now.value), [query, pool]);
  const close = (): void => void (searchOpen.value = false);

  const go = (inst: Instance): void => {
    close();
    show('day', inst.start);
    // Open it the way the day shows it: as the run of lessons it belongs to, if it is one.
    const day = startOfDay(inst.start);
    const blocks = toBlocks(expand(doc.value, day.getTime(), addDays(day, 1).getTime(), true));
    detail.value = blocks.find((b) => b.parts.some((p) => p.key === inst.key)) ?? null;
  };

  return (
    <Dialog title={t('search')} onClose={close} class="search">
      <input
        type="text"
        class="search-input"
        placeholder={`${t('search')}…`}
        aria-label={t('search')}
        value={query}
        data-focus
        onInput={(e) => {
          setQuery(e.currentTarget.value);
          setPicked(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setPicked(Math.min(picked + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setPicked(Math.max(picked - 1, 0));
          } else if (e.key === 'Enter' && results[picked]) {
            go(results[picked]);
          }
        }}
      />
      <ul class="search-results" role="listbox">
        {results.map((inst, i) => (
          <li key={inst.key} role="option" aria-selected={i === picked}>
            <button type="button" class={i === picked ? 'picked' : ''} style={paint(inst)} onClick={() => go(inst)} onMouseEnter={() => setPicked(i)}>
              <span class="card-colors" aria-hidden="true" />
              <span class="search-title">{splitCancelled(inst.event.title).title || t('untitled')}</span>
              <span class="search-meta">
                {inst.calendar.name} · {shortDate(lang.value, inst.start)}
                {!inst.allDay && ` ${hm(inst.start)}`}
              </span>
            </button>
          </li>
        ))}
        {query.trim() && !results.length && <li class="search-none">{t('noEvents')}</li>}
      </ul>
    </Dialog>
  );
}
