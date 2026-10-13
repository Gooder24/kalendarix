// The small calendar that opens under the bar: a month to glance at, and the
// chosen day as a list. Anything more is one click away in the full window.

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { addDays, addMonths, dayNumber, startOfDay, startOfMonth, startOfWeek, ymd } from '../../core/dates';
import { countEvents, longDate, relativeDay } from '../../core/i18n';
import { expand } from '../../core/instances';
import { backend } from '../../platform/backend';
import { blocksOn, detail, doc, lang, loaded, now, settings, t } from '../../state/store';
import { Agenda } from '../Agenda';
import { Button } from '../common';
import { EventDetail } from '../EventDetail';
import { MiniMonth } from '../MiniMonth';

/** The colours of what happens on each day of the weeks a month touches. */
function marksFor(month: number): Map<number, string[]> {
  const from = startOfWeek(startOfMonth(month));
  const to = addDays(startOfWeek(addMonths(startOfMonth(month), 1)), 7);
  const accentFills = settings.value.dualFill === 'accent';
  const map = new Map<number, string[]>();
  for (const inst of expand(doc.value, from.getTime(), to.getTime())) {
    const color = accentFills ? (inst.accent ?? inst.color) : inst.color;
    for (let day = inst.firstDay; day <= inst.lastDay; day++) {
      const list = map.get(day) ?? [];
      if (list.length < 3 && !list.includes(color)) list.push(color);
      map.set(day, list);
    }
  }
  return map;
}

export function Popup() {
  const [day, setDay] = useState(() => startOfDay(Date.now()).getTime());
  const [month, setMonth] = useState(day);
  const root = useRef<HTMLDivElement>(null);

  // Every time it is shown it starts on today, whatever was left open.
  useEffect(
    () =>
      backend.on('popup-opened', () => {
        const today = startOfDay(Date.now()).getTime();
        setDay(today);
        setMonth(today);
        detail.value = null;
      }),
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !detail.value) void backend.hidePopup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // The window is as tall as what it shows.
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const content = root.current?.scrollHeight ?? 0;
      const dialog = document.querySelector<HTMLElement>('.dialog')?.offsetHeight ?? 0;
      if (content) void backend.resizePopup(Math.max(content, dialog + 16));
    });
    return () => cancelAnimationFrame(frame);
  });

  if (!loaded.value) return <div class="popup loading" />;
  const list = blocksOn(day);
  const date = longDate(lang.value, day);
  return (
    <div class="popup" ref={root}>
      <MiniMonth
        month={month}
        selected={dayNumber(day)}
        marks={marksFor(month)}
        onMonth={(m) => setMonth(m.getTime())}
        onPick={(picked) => {
          setDay(picked.getTime());
          setMonth(picked.getTime());
        }}
      />
      <header class="agenda-head">
        <h2>{date.charAt(0).toUpperCase() + date.slice(1)}</h2>
        <p>
          {relativeDay(lang.value, day, now.value)}
          {list.length > 0 && ` · ${countEvents(lang.value, list.length)}`}
        </p>
      </header>
      {list.length ? <Agenda blocks={list} day={dayNumber(day)} onOpen={(block) => (detail.value = block)} /> : <p class="empty">{t('noEvents')}</p>}
      <footer class="popup-foot">
        <Button icon="external" label={t('openInApp')} onClick={() => void backend.showMain(ymd(day))} />
      </footer>
      {detail.value && <EventDetail key={detail.value.key} block={detail.value} openInApp />}
    </div>
  );
}
