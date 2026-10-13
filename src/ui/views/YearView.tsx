// A year at a glance: twelve small months, each day marked with the colours of
// what happens on it.

import { dayNumber, daysInMonth, fromDayNumber, startOfWeek } from '../../core/dates';
import { monthName, weekdayNames } from '../../core/i18n';
import { cursor, instances, lang, settings, show, today } from '../../state/store';

/** Up to three colours per day, in the order the events start. */
function colorsByDay(): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const accentFills = settings.value.dualFill === 'accent';
  for (const inst of instances.value) {
    const color = accentFills ? (inst.accent ?? inst.color) : inst.color;
    for (let day = inst.firstDay; day <= inst.lastDay; day++) {
      const list = map.get(day) ?? [];
      if (list.length < 3 && !list.includes(color)) list.push(color);
      map.set(day, list);
    }
  }
  return map;
}

export function YearView() {
  const year = new Date(cursor.value).getFullYear();
  const colors = colorsByDay();
  const names = weekdayNames(lang.value, 'narrow');
  return (
    <div class="year">
      {Array.from({ length: 12 }, (_, month) => {
        const first = new Date(year, month, 1);
        const start = dayNumber(startOfWeek(first));
        const offset = dayNumber(first) - start;
        return (
          <section class="year-month" key={month}>
            <button type="button" class="year-month-name" onClick={() => show('month', first)}>
              {monthName(lang.value, month)}
            </button>
            <div class="year-grid">
              {names.map((n, i) => (
                <span key={i} class="year-dow">{n}</span>
              ))}
              {Array.from({ length: offset }, (_, i) => (
                <span key={`pad-${i}`} />
              ))}
              {Array.from({ length: daysInMonth(year, month) }, (_, i) => {
                const day = dayNumber(first) + i;
                const marks = colors.get(day);
                return (
                  <button
                    type="button"
                    key={day}
                    class={`year-day ${day === today.value ? 'today' : ''} ${marks ? 'busy' : ''}`}
                    onClick={() => show('day', fromDayNumber(day))}
                  >
                    <span>{i + 1}</span>
                    {marks && (
                      <span class="year-marks" aria-hidden="true">
                        {marks.map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
