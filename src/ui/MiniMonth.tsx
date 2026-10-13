// A small month to pick a day from: in the sidebar, in the date fields of the
// event form, and in the small calendar under the bar.

import { addMonths, dayNumber, fromDayNumber, startOfMonth, startOfWeek } from '../core/dates';
import { monthName, weekdayNames } from '../core/i18n';
import { lang, t, today } from '../state/store';
import { Button } from './common';

export function MiniMonth(props: {
  /** Any moment in the month to show. */
  month: number;
  /** The day that is picked, as a day number. */
  selected?: number;
  /** Colours to mark days with, by day number. */
  marks?: Map<number, string[]>;
  onPick: (day: Date) => void;
  onMonth: (month: Date) => void;
  onTitle?: () => void;
}) {
  const first = startOfMonth(props.month);
  const start = dayNumber(startOfWeek(first));
  const weeks = Math.ceil((dayNumber(first) - start + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7);
  const title = `${monthName(lang.value, first.getMonth())} ${first.getFullYear()}`;
  return (
    <div class="mini">
      <div class="mini-head">
        {props.onTitle ? (
          <button type="button" class="mini-title" onClick={props.onTitle}>{title}</button>
        ) : (
          <span class="mini-title">{title}</span>
        )}
        <Button icon="prev" title={t('previous')} kind="ghost" onClick={() => props.onMonth(addMonths(first, -1))} />
        <Button icon="next" title={t('next')} kind="ghost" onClick={() => props.onMonth(addMonths(first, 1))} />
      </div>
      <div class="mini-grid">
        {weekdayNames(lang.value, 'narrow').map((name, i) => (
          <span key={i} class="mini-dow">{name}</span>
        ))}
        {Array.from({ length: weeks * 7 }, (_, i) => {
          const day = start + i;
          const date = fromDayNumber(day);
          const marks = props.marks?.get(day);
          const classes = ['mini-day', date.getMonth() !== first.getMonth() ? 'other' : '', day === today.value ? 'today' : '', day === props.selected ? 'picked' : ''];
          return (
            <button type="button" key={day} class={classes.filter(Boolean).join(' ')} onClick={() => props.onPick(date)}>
              <span>{date.getDate()}</span>
              {marks && (
                <span class="mini-marks" aria-hidden="true">
                  {marks.map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
