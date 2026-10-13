// A day read as a list: one card per event with what matters about it. Used
// beside the hours in the day view and in the small calendar under the bar.

import { hm } from '../core/dates';
import { parseDetails } from '../core/details';
import { countLessons, duration, shortDate } from '../core/i18n';
import type { Block } from '../core/instances';
import { lang, now, t } from '../state/store';
import { paint, titleOf } from './common';
import { Icon } from './Icon';

/** The left column of a card: when, in as few characters as say it. */
function when(block: Block, day: number): { top: string; bottom: string } {
  if (block.allDay) {
    const days = block.lastDay - block.firstDay + 1;
    return days > 1
      ? { top: t('allDay'), bottom: `${day - block.firstDay + 1}/${days}` } // which of its days this is
      : { top: t('allDay'), bottom: '' };
  }
  const first = block.firstDay === day;
  const last = block.lastDay === day;
  return {
    top: first ? hm(block.start) : shortDate(lang.value, block.start),
    bottom: last ? hm(block.end) : shortDate(lang.value, block.end),
  };
}

export function AgendaCard({ block, day, onOpen }: { block: Block; day: number; onOpen: (block: Block) => void }) {
  const { title, cancelled } = titleOf(block);
  const time = when(block, day);
  const event = block.head.event;
  const teacher = parseDetails(event.notes || event.description).fields.find((f) => f.kind === 'teacher')?.value;
  const running = !block.allDay && block.start <= now.value && now.value < block.end;
  const over = !block.allDay && block.end <= now.value;
  const classes = ['card', cancelled ? 'cancelled' : '', running ? 'running' : '', over ? 'over' : ''];
  return (
    <button type="button" class={classes.filter(Boolean).join(' ')} style={paint(block.head)} onClick={() => onOpen(block)}>
      <span class="card-colors" aria-hidden="true" />
      <span class="card-when">
        <span>{time.top}</span>
        {time.bottom && <span>{time.bottom}</span>}
      </span>
      <span class="card-body">
        <span class="card-title">{title}</span>
        <span class="card-meta">
          {cancelled && <span class="tag-err">{t('cancelled')}</span>}
          {running && <span class="tag-on">{t('now')}</span>}
          {!block.allDay && <span>{duration(lang.value, block.end - block.start)}</span>}
          {block.parts.length > 1 && <span>{countLessons(lang.value, block.parts.length)}</span>}
          {event.location && (
            <span class="with-icon">
              <Icon name="pin" />
              {event.location}
            </span>
          )}
          {teacher && (
            <span class="with-icon">
              <Icon name="person" />
              {teacher}
            </span>
          )}
          <span class="card-calendar">{block.head.calendar.name}</span>
        </span>
      </span>
    </button>
  );
}

export function Agenda({ blocks, day, onOpen }: { blocks: Block[]; day: number; onOpen: (block: Block) => void }) {
  const ordered = [...blocks].sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start - b.start);
  return (
    <div class="agenda-list">
      {ordered.map((block) => (
        <AgendaCard key={block.key} block={block} day={day} onOpen={onOpen} />
      ))}
    </div>
  );
}
