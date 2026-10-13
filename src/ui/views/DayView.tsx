// One day in full: its hours on the left, and everything that happens in it
// as a list on the right.

import { atMinute, dayNumber, startOfWeek } from '../../core/dates';
import { countEvents, longDate, relativeDay } from '../../core/i18n';
import { blocks, cursor, detail, lang, newEvent, now, t } from '../../state/store';
import { Agenda } from '../Agenda';
import { Button } from '../common';
import { TimeGrid } from './TimeGrid';

export function DayView() {
  const day = dayNumber(cursor.value);
  const list = blocks.value.filter((b) => b.firstDay <= day && b.lastDay >= day);
  const date = longDate(lang.value, cursor.value);
  return (
    <div class="dayview">
      <TimeGrid first={day} days={1} />
      <aside class="agenda" aria-label={date}>
        <header class="agenda-head">
          <h2>{date.charAt(0).toUpperCase() + date.slice(1)}</h2>
          <p>
            {relativeDay(lang.value, cursor.value, now.value)}
            {list.length > 0 && ` · ${countEvents(lang.value, list.length)}`}
          </p>
        </header>
        {list.length ? (
          <Agenda blocks={list} day={day} onOpen={(block) => (detail.value = block)} />
        ) : (
          <div class="empty">
            <p>{t('nothingPlanned')}</p>
            <p class="hint">{t('hintCreate')}</p>
          </div>
        )}
        <Button icon="plus" label={t('newEvent')} onClick={() => newEvent(atMinute(cursor.value, 9 * 60))} />
      </aside>
    </div>
  );
}

export function WeekView() {
  return <TimeGrid first={dayNumber(startOfWeek(cursor.value))} days={7} />;
}
