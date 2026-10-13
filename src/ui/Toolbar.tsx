// The bar across the top: where you are, how to move, which view.

import { addDays, startOfWeek, weekNumber } from '../core/dates';
import { dayMonth, longDate, monthName } from '../core/i18n';
import type { ViewId } from '../core/types';
import { cursor, goToday, lang, newEvent, searchOpen, setSettings, settings, settingsOpen, show, sidebarShown, step, t, toggleSidebar, view } from '../state/store';
import { Button } from './common';

const VIEWS: ViewId[] = ['day', 'week', 'month', 'year'];

/** What the view shows, in words. */
export function heading(): { main: string; sub?: string } {
  const c = new Date(cursor.value);
  switch (view.value) {
    case 'year':
      return { main: String(c.getFullYear()) };
    case 'month':
      return { main: `${monthName(lang.value, c.getMonth())} ${c.getFullYear()}` };
    case 'week': {
      const first = startOfWeek(c);
      const last = addDays(first, 6);
      const from = first.getMonth() === last.getMonth() ? `${first.getDate()}.` : dayMonth(lang.value, first);
      return { main: `${from} – ${dayMonth(lang.value, last)} ${last.getFullYear()}`, sub: `${weekNumber(first)}. ${t('week').toLowerCase()}` };
    }
    default: {
      const text = longDate(lang.value, c);
      return { main: text.charAt(0).toUpperCase() + text.slice(1) };
    }
  }
}

export function Toolbar() {
  const title = heading();
  const timed = view.value === 'week' || view.value === 'day';
  return (
    <header class="toolbar">
      <Button
        icon="sidebar"
        title={t('sidebar')}
        kind="ghost"
        active={sidebarShown.value}
        onClick={toggleSidebar}
      />
      <Button label={t('today')} onClick={goToday} />
      <Button icon="prev" title={t('previous')} kind="ghost" onClick={() => step(-1)} />
      <Button icon="next" title={t('next')} kind="ghost" onClick={() => step(1)} />
      <h1 class="toolbar-title">
        {title.main}
        {title.sub && <small>{title.sub}</small>}
      </h1>
      <div class="seg" role="tablist">
        {VIEWS.map((id) => (
          <button type="button" key={id} role="tab" aria-selected={view.value === id} class={view.value === id ? 'active' : ''} data-short={t(id).charAt(0)} onClick={() => show(id)}>
            <span>{t(id)}</span>
          </button>
        ))}
      </div>
      {timed && (
        <Button icon="clock" label={t('actual')} title={t('actualHint')} active={settings.value.showActual} class="hide-narrow" onClick={() => setSettings({ showActual: !settings.value.showActual })} />
      )}
      <Button icon="search" title={`${t('search')} (Ctrl+K)`} kind="ghost" onClick={() => (searchOpen.value = true)} />
      <Button icon="plus" label={t('newEvent')} kind="primary" class="label-wide" onClick={() => newEvent()} />
      <Button icon="settings" title={t('settings')} kind="ghost" onClick={() => (settingsOpen.value = true)} />
    </header>
  );
}
