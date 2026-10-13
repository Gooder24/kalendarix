// The hours of one day or of a week: whole-day events in a strip on top, the
// rest at their time below.

import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { addDays, atMinute, dayNumber, fromDayNumber, minuteOfDay, pad2 } from '../../core/dates';
import { duration, translate, weekdayNames, type TextKey } from '../../core/i18n';
import { isBar } from '../../core/instances';
import { layoutDay, layoutRow } from '../../core/layout';
import type { ActualEntry } from '../../platform/backend';
import { actual, blocks, lang, loadActual, metrics, newEvent, now, settings, show, t, today, view } from '../../state/store';
import { Chip, SlotBox, dragging, dropOn } from '../EventChip';
import { signal } from '@preact/signals';

/** The tracked activity whose details are shown, if any. */
export const actualDetail = signal<ActualEntry | null>(null);

const ACTUAL_COLORS: Record<string, string> = {
  deep_work: 'var(--accent-2)', shallow_work: 'var(--accent)', meeting: 'var(--text-2)', comms: 'var(--text-2)',
  learning: 'var(--accent)', admin: 'var(--text-3)', distraction: 'var(--err)', break: 'var(--warn)',
};

export function actualCategory(category: string): string {
  const key = `cat_${category}` as TextKey;
  const name = translate(lang.value, key);
  return name === key ? category || '–' : name;
}

/** Where in a column the pointer is, as minutes from midnight snapped to a step. */
function minuteAt(e: MouseEvent, hour: number, snap: number): number {
  const top = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
  const minutes = ((e.clientY - top) / hour) * 60;
  return Math.max(0, Math.min(24 * 60 - snap, Math.floor(minutes / snap) * snap));
}

export function TimeGrid({ first, days }: { first: number; days: number }) {
  const scroller = useRef<HTMLDivElement>(null);
  const hour = metrics.value.hour;
  const list = Array.from({ length: days }, (_, i) => first + i);
  const all = blocks.value;
  const strip = layoutRow(all.filter(isBar), first, days);
  const lane = settings.value.showActual;

  // Open on the morning: an hour before the first event shown, or seven o'clock.
  useLayoutEffect(() => {
    const starts = blocks.value.filter((b) => !isBar(b)).map((b) => minuteOfDay(b.start));
    const from = starts.length ? Math.max(0, Math.min(...starts) - 60) : 7 * 60;
    // A little above the hour, so its label is whole.
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (Math.min(from, 8 * 60) / 60) * hour - 10);
  }, [hour]);

  useEffect(() => {
    if (lane) void loadActual(fromDayNumber(first), days);
  }, [lane, first, days]);

  const names = weekdayNames(lang.value);
  return (
    <div class="tg" style={{ '--days': days }}>
      <div class="tg-head">
        <div class="tg-gutter" />
        {list.map((day) => {
          const date = fromDayNumber(day);
          return (
            <button
              type="button"
              key={day}
              class={`tg-day ${day === today.value ? 'today' : ''}`}
              disabled={view.value === 'day'}
              onClick={() => show('day', date)}
            >
              <span class="tg-day-name">{names[(date.getDay() + 6) % 7]}</span>
              <span class="num">{date.getDate()}</span>
            </button>
          );
        })}
      </div>

      <div class="tg-strip">
        <div class="tg-gutter">{t('allDay')}</div>
        <div class="tg-strip-days" style={{ minHeight: `${Math.max(1, strip.lanes) * metrics.value.lane + 4}px` }}>
          {list.map((day) => (
            <div
              key={day}
              class="tg-strip-cell"
              onDblClick={() => newEvent(fromDayNumber(day), addDays(fromDayNumber(day), 1), true)}
              onDragOver={(e) => {
                if (dragging()) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                dropOn(day, null);
              }}
            />
          ))}
          <div class="lanes">
            {strip.placed.map((placed) => (
              <Chip key={placed.block.key} placed={placed} rowStart={first} />
            ))}
          </div>
        </div>
      </div>

      <div class="tg-scroll" ref={scroller}>
        <div class="tg-body">
          <div class="tg-gutter tg-hours">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h}>
                <span>{h ? `${pad2(h)}:00` : ''}</span>
              </div>
            ))}
          </div>
          {list.map((day) => {
            const date = fromDayNumber(day);
            return (
              <div
                key={day}
                class={`tg-col ${day === today.value ? 'today' : ''} ${lane ? 'with-actual' : ''}`}
                onDblClick={(e) => {
                  const start = atMinute(date, minuteAt(e, hour, 30));
                  newEvent(start, new Date(start.getTime() + 3_600_000));
                }}
                onDragOver={(e) => {
                  if (dragging()) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOn(day, minuteAt(e, hour, 1));
                }}
              >
                {day === today.value && <div class="now" style={{ top: `${(minuteOfDay(now.value) / 60) * hour}px` }} />}
                <div class="plan">
                  {layoutDay(all, day).map((slot) => (
                    <SlotBox key={slot.block.key} slot={slot} hour={hour} />
                  ))}
                </div>
                {lane && (
                  <div class="actual-lane">
                    {actual.value.entries.map((entry) => (
                      <ActualBox key={entry.uid + entry.start} entry={entry} day={day} hour={hour} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {lane && !actual.value.entries.length && <div class="tg-note">{t('actualEmpty')}</div>}
    </div>
  );
}

/** One stretch of what really happened, in the narrow lane beside the plan. */
function ActualBox({ entry, day, hour }: { entry: ActualEntry; day: number; hour: number }) {
  const dayStart = fromDayNumber(day).getTime();
  const dayEnd = fromDayNumber(day + 1).getTime();
  const start = Math.max(Date.parse(entry.start), dayStart);
  const end = Math.min(Date.parse(entry.end), dayEnd);
  if (!(end > start) || dayNumber(start) !== day) return null;
  const minutes = (end - start) / 60_000;
  const unsure = entry.confidence < 0.5;
  return (
    <button
      type="button"
      class={`actual ${unsure ? 'unsure' : ''}`}
      style={{
        top: `${((start - dayStart) / 3_600_000) * hour}px`,
        height: `${Math.max(3, (minutes / 60) * hour - 1)}px`,
        '--fill': ACTUAL_COLORS[entry.category] ?? 'var(--text-3)',
      }}
      title={`${entry.title || actualCategory(entry.category)} · ${duration(lang.value, entry.activeSeconds * 1000)}`}
      onClick={(e) => {
        e.stopPropagation();
        actualDetail.value = entry;
      }}
      onDblClick={(e) => e.stopPropagation()}
    >
      {minutes >= 25 && <span>{(unsure ? '? ' : '') + (entry.title || actualCategory(entry.category))}</span>}
    </button>
  );
}
