// An event as it appears in a grid: one line in a row of days, or a box among
// the hours.

import { moveEvent } from '../core/document';
import { atMinute, dayNumber, fromDayNumber, hm, minuteOfDay } from '../core/dates';
import type { Block } from '../core/instances';
import type { Placed, Slot } from '../core/layout';
import { apply, detail, lang, metrics, show, t } from '../state/store';
import { countLessons } from '../core/i18n';
import { paint, timeRange, titleOf } from './common';

/**
 * What is being dragged, and where it was taken hold of: a week-long bar picked
 * up by its Wednesday and dropped on a Friday should put its Wednesday there,
 * not its first day.
 */
interface Dragged {
  block: Block;
  /** Days from the block's first day to the day under the pointer. */
  dayOffset: number;
  /** Minutes from the block's start to the time under the pointer. */
  minuteOffset: number;
}
let dragged: Dragged | null = null;
export const dragging = (): boolean => dragged !== null;

function dragProps(block: Block, grip: (e: DragEvent) => { dayOffset: number; minuteOffset: number }) {
  // Only what the user made can be moved; a feed would put it back.
  if (block.head.managed) return {};
  return {
    draggable: true,
    onDragStart: (e: DragEvent) => {
      dragged = { block, ...grip(e) };
      e.dataTransfer?.setData('text/plain', block.key);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    },
    onDragEnd: () => {
      dragged = null;
    },
  };
}

/**
 * Drop the dragged event on a day, and at a time of that day when dropped among
 * the hours (`minute`, from midnight). Without a time, and for whole-day events
 * always, only the day changes.
 */
export function dropOn(day: number, minute: number | null): void {
  const d = dragged;
  dragged = null;
  if (!d || d.block.head.managed) return;
  const { block } = d;
  const keepsTime = block.allDay || minute === null;
  const time = keepsTime ? minuteOfDay(block.start) : Math.min(24 * 60 - 15, Math.max(0, Math.round((minute - d.minuteOffset) / 15) * 15));
  const to = atMinute(fromDayNumber(day - d.dayOffset), time).getTime();
  if (dayNumber(to) === block.firstDay && (keepsTime || time === minuteOfDay(block.start))) return;
  void apply(moveEvent(block.head.calId, block.head.uid, block.start, to));
}


function open(block: Block, e: Event): void {
  e.stopPropagation();
  detail.value = block;
}

/** A day of lessons as one line: when it runs, and the colour of each lesson along its foot. */
function SummaryChip({ placed }: { placed: Placed }) {
  const { block } = placed;
  const step = 100 / block.parts.length;
  // Hard stops: each lesson is a solid piece, in its own colour.
  const stops = block.parts.map((part, i) => `${part.accent ?? part.color} ${i * step}% ${(i + 1) * step}%`);
  return (
    <button
      type="button"
      class="chip summary"
      style={{ '--stripe': block.head.color, '--parts': `linear-gradient(to right, ${stops.join(', ')})`, gridColumn: placed.col + 1, gridRow: placed.lane + 1 }}
      title={block.parts.map((part) => `${hm(part.start)} ${part.event.title}`).join('\n')}
      onClick={(e) => {
        e.stopPropagation();
        show('day', block.start);
      }}
    >
      <span class="chip-time">{hm(block.start)}–{hm(block.end)}</span>
      <span class="chip-title">{block.parts.length} {t('lessonsShort')}</span>
    </button>
  );
}

/** One line in a row of days; a bar when the event covers several of them. `rowStart` is the row's first day. */
export function Chip({ placed, rowStart }: { placed: Placed; rowStart: number }) {
  const { block } = placed;
  if (block.summary) return <SummaryChip placed={placed} />;
  const grip = (e: DragEvent): { dayOffset: number; minuteOffset: number } => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dayInPiece = Math.min(placed.span - 1, Math.max(0, Math.floor(((e.clientX - box.left) / box.width) * placed.span)));
    return { dayOffset: rowStart + placed.col + dayInPiece - block.firstDay, minuteOffset: 0 };
  };
  const { title, cancelled } = titleOf(block);
  const timed = !block.allDay && !placed.continuesBefore;
  const classes = ['chip', cancelled ? 'cancelled' : '', placed.continuesBefore ? 'from-before' : '', placed.continuesAfter ? 'goes-on' : ''];
  return (
    <button
      type="button"
      class={classes.filter(Boolean).join(' ')}
      style={{ ...paint(block.head), gridColumn: `${placed.col + 1} / span ${placed.span}`, gridRow: placed.lane + 1 }}
      title={`${timed ? timeRange(block.start, block.end) + '  ' : ''}${title}`}
      onClick={(e) => open(block, e)}
      {...dragProps(block, grip)}
    >
      {timed && <span class="chip-time">{hm(block.start)}</span>}
      <span class="chip-title">{title}</span>
    </button>
  );
}

/** A box among the hours of a day. */
export function SlotBox({ slot, hour }: { slot: Slot; hour: number }) {
  const { block } = slot;
  const { title, cancelled } = titleOf(block);
  // One pixel short of its time, so two events that follow each other do not touch.
  const height = (slot.height / 60) * hour - 1;
  const classes = ['slot', cancelled ? 'cancelled' : '', slot.continuesBefore ? 'from-before' : '', slot.continuesAfter ? 'goes-on' : '', height < metrics.value.line * 2 + 4 ? 'short' : ''];
  return (
    <button
      type="button"
      class={classes.filter(Boolean).join(' ')}
      style={{
        ...paint(block.head),
        top: `${(slot.top / 60) * hour}px`,
        height: `${height}px`,
        left: `${(slot.col / slot.cols) * 100}%`,
        width: `calc(${(slot.width / slot.cols) * 100}% - 2px)`,
      }}
      title={`${timeRange(block.start, block.end)}  ${title}`}
      onClick={(e) => open(block, e)}
      onDblClick={(e) => e.stopPropagation()}
      {...dragProps(block, (e) => {
        const top = (e.currentTarget as HTMLElement).getBoundingClientRect().top;
        return { dayOffset: 0, minuteOffset: Math.max(0, ((e.clientY - top) / hour) * 60) };
      })}
    >
      <span class="slot-title">{title}</span>
      <span class="slot-meta">
        {timeRange(block.start, block.end)}
        {block.parts.length > 1 && ` · ${countLessons(lang.value, block.parts.length)}`}
        {block.head.event.location && ` · ${block.head.event.location}`}
      </span>
    </button>
  );
}
