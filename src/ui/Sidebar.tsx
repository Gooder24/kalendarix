// The column on the left: a month to jump around in, and the calendars with
// their colours.

import { categoryById, categoryName } from '../core/categories';
import { calendarColor } from '../core/colors';
import { updateCalendar } from '../core/document';
import { isSynced } from '../core/instances';
import type { StoredCalendar } from '../core/types';
import { apply, calendarEditor, categories, cursor, doc, lang, show, t } from '../state/store';
import { dayNumber } from '../core/dates';
import { Button } from './common';
import { Icon } from './Icon';
import { MiniMonth } from './MiniMonth';

function CalendarRow({ calendar }: { calendar: StoredCalendar }) {
  const color = calendarColor(calendar, categories.value);
  const category = categoryById(categories.value, calendar.category);
  const on = calendar.visible !== false;
  return (
    <li class={`cal ${on ? '' : 'off'}`}>
      <button
        type="button"
        class={`cal-toggle ${calendar.autoAccent ? 'two' : ''}`}
        style={{ '--fill': color }}
        role="switch"
        aria-checked={on}
        title={on ? t('hide') : t('show')}
        onClick={() => void apply(updateCalendar(calendar.id, { visible: !on }))}
      />
      <button type="button" class="cal-name" title={category ? categoryName(category, lang.value) : undefined} onClick={() => void apply(updateCalendar(calendar.id, { visible: !on }))}>
        {calendar.name || t('untitled')}
      </button>
      {isSynced(calendar) && <span class="cal-badge" title={t('subscribed')}><Icon name="repeat" /></span>}
      <Button icon="edit" title={t('editCalendar')} kind="ghost" class="cal-edit" onClick={() => (calendarEditor.value = calendar.id)} />
    </li>
  );
}

export function Sidebar() {
  return (
    <aside class="sidebar">
      <MiniMonth
        month={cursor.value}
        selected={dayNumber(cursor.value)}
        onPick={(day) => show('day', day)}
        onMonth={(month) => (cursor.value = month.getTime())}
        onTitle={() => show('month')}
      />
      <h3 class="sidebar-title">{t('calendars')}</h3>
      <ul class="cal-list">
        {doc.value.calendars.map((calendar) => (
          <CalendarRow key={calendar.id} calendar={calendar} />
        ))}
      </ul>
      <Button icon="plus" label={t('newCalendar')} kind="ghost" onClick={() => (calendarEditor.value = 'new')} />
    </aside>
  );
}
