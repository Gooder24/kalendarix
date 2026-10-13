// The main window: toolbar, sidebar, the view, and whichever dialog is open.

import { useEffect } from 'preact/hooks';
import {
  calendarEditor, closeDialogs, detail, doc, form, goToday, loaded, newEvent, notice, phoneExportOpen, searchOpen, settingsOpen, show,
  sidebarShown, step, t, view,
} from '../state/store';
import { ActualDetail } from './ActualDetail';
import { CalendarEditor } from './CalendarEditor';
import { Button } from './common';
import { EventDetail } from './EventDetail';
import { EventForm } from './EventForm';
import { PhoneExport } from './PhoneExport';
import { SearchPalette } from './SearchPalette';
import { SettingsDialog, importFiles } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';
import { DayView, WeekView } from './views/DayView';
import { MonthView } from './views/MonthView';
import { actualDetail } from './views/TimeGrid';
import { YearView } from './views/YearView';
import { backend } from '../platform/backend';

function dialogOpen(): boolean {
  return !!(detail.value || form.value || calendarEditor.value || searchOpen.value || settingsOpen.value || phoneExportOpen.value || actualDetail.value);
}

/** Keys that work anywhere but in a text field. */
function onKey(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    closeDialogs();
    searchOpen.value = true;
    return;
  }
  const target = e.target as HTMLElement | null;
  const typing = target?.matches?.('input, textarea, select, [contenteditable]');
  if (typing || dialogOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  switch (e.key) {
    case 'ArrowLeft': step(-1); break;
    case 'ArrowRight': step(1); break;
    case 't': goToday(); break;
    case 'd': show('day'); break;
    case 'w': show('week'); break;
    case 'm': show('month'); break;
    case 'y': show('year'); break;
    case 'n': newEvent(); break;
    case '/': searchOpen.value = true; break;
    default: return;
  }
  e.preventDefault();
}

function Welcome() {
  return (
    <div class="welcome">
      <h2>{t('welcome')}</h2>
      <p>{t('welcomeText')}</p>
      <div class="tools">
        <Button icon="plus" label={t('createFirst')} kind="primary" onClick={() => (calendarEditor.value = 'new')} />
        <Button icon="upload" label={t('importIcs')} onClick={() => void backend.pickIcsFiles().then(importFiles)} />
      </div>
    </div>
  );
}

export function App() {
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!loaded.value) return <div class="app loading" />;
  const empty = doc.value.calendars.length === 0;
  return (
    <div
      class="app"
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = [...(e.dataTransfer?.files ?? [])].filter((f) => /\.ics$/i.test(f.name));
        if (!files.length) return;
        e.preventDefault();
        void Promise.all(files.map(async (f) => ({ name: f.name.replace(/\.ics$/i, ''), text: await f.text() }))).then(importFiles);
      }}
    >
      <Toolbar />
      <div class="body">
        {sidebarShown.value && <Sidebar />}
        <main class="view" data-view={view.value}>
          {empty ? <Welcome /> : view.value === 'year' ? <YearView /> : view.value === 'week' ? <WeekView /> : view.value === 'day' ? <DayView /> : <MonthView />}
        </main>
      </div>

      {detail.value && <EventDetail key={detail.value.key} block={detail.value} />}
      {form.value && <EventForm request={form.value} />}
      {calendarEditor.value && <CalendarEditor key={calendarEditor.value} id={calendarEditor.value} />}
      {searchOpen.value && <SearchPalette />}
      {settingsOpen.value && <SettingsDialog />}
      {phoneExportOpen.value && <PhoneExport />}
      {actualDetail.value && <ActualDetail entry={actualDetail.value} />}
      {notice.value && <div class={`notice ${notice.value.bad ? 'bad' : ''}`} role="status">{notice.value.text}</div>}
    </div>
  );
}
