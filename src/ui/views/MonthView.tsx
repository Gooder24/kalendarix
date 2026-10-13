// A month as rows of weeks. An event that covers several days is one bar across
// them; clicking a day opens that day.

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { atMinute, dayNumber, fromDayNumber, weekNumber } from '../../core/dates';
import { weekdayNames } from '../../core/i18n';
import { summarise } from '../../core/instances';
import { layoutRow } from '../../core/layout';
import { blocks, cursor, lang, metrics, newEvent, range, show, t, today } from '../../state/store';
import { Chip, dragging, dropOn } from '../EventChip';
import { Icon } from '../Icon';

export function MonthView() {
  const firstDay = dayNumber(range.value[0]);
  const weeks = Math.round((dayNumber(range.value[1]) - firstDay) / 7);
  const month = new Date(cursor.value).getMonth();
  const grid = useRef<HTMLDivElement>(null);
  // How many lines of events fit under a day number; measured, as it depends on the window.
  const [maxLanes, setMaxLanes] = useState(4);

  useLayoutEffect(() => {
    const el = grid.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = (): void => {
      const row = el.clientHeight / weeks;
      if (row > 0) setMaxLanes(Math.max(1, Math.floor((row - metrics.value.cellHead - 2) / metrics.value.lane)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [weeks, metrics.value]);

  const lines = summarise(blocks.value);
  return (
    <div class="month">
      <div class="month-head">
        {weekdayNames(lang.value).map((name, i) => (
          <div key={name} class={i >= 5 ? 'weekend' : ''}>{name}</div>
        ))}
      </div>
      <div class="month-weeks" ref={grid}>
        {Array.from({ length: weeks }, (_, w) => {
          const start = firstDay + w * 7;
          const layout = layoutRow(lines, start, 7, maxLanes);
          return (
            <div class="week" key={start}>
              {Array.from({ length: 7 }, (_, d) => {
                const day = start + d;
                const date = fromDayNumber(day);
                const classes = ['cell', date.getMonth() !== month ? 'other' : '', day === today.value ? 'today' : '', d >= 5 ? 'weekend' : ''];
                return (
                  <div
                    key={day}
                    class={classes.filter(Boolean).join(' ')}
                    role="button"
                    tabIndex={0}
                    aria-label={date.toLocaleDateString(lang.value === 'en' ? 'en-GB' : 'sk-SK', { weekday: 'long', day: 'numeric', month: 'long' })}
                    onClick={() => show('day', date)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        show('day', date);
                      }
                    }}
                    onDragOver={(e) => {
                      if (dragging()) e.preventDefault();
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      // Keeps its hour: only the day changes.
                      dropOn(day, null);
                    }}
                  >
                    {d === 0 && (
                      <button
                        type="button"
                        class="weeknum"
                        title={`${weekNumber(date)}. ${t('week').toLowerCase()}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          show('week', date);
                        }}
                      >
                        {weekNumber(date)}
                      </button>
                    )}
                    <button
                      type="button"
                      class="cell-add"
                      title={t('newEvent')}
                      onClick={(e) => {
                        e.stopPropagation();
                        newEvent(atMinute(date, 9 * 60));
                      }}
                    >
                      <Icon name="plus" />
                    </button>
                    <span class="num">{date.getDate()}</span>
                  </div>
                );
              })}
              <div class="lanes">
                {layout.placed.map((placed) => (
                  <Chip key={placed.block.key} placed={placed} rowStart={start} />
                ))}
                {layout.hidden.map(
                  (count, col) =>
                    count > 0 && (
                      <button
                        type="button"
                        key={`more-${col}`}
                        class="more"
                        style={{ gridColumn: col + 1, gridRow: maxLanes }}
                        onClick={() => show('day', fromDayNumber(start + col))}
                      >
                        +{count} {t('more')}
                      </button>
                    ),
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
