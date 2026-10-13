// Everything about one event, laid out to be read: what it is and which kind,
// when (and how far off), where, who, and what comes before and after it.

import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { categoryById, categoryName } from '../core/categories';
import { ACCENT_PALETTE, eventColor, textOn, titleKey } from '../core/colors';
import { hm, ymd } from '../core/dates';
import { linkify, parseDetails, type Field } from '../core/details';
import { deleteEvent, deleteOccurrence, setAccent } from '../core/document';
import { alarmText, countLessons, duration, relativeDay, relativeTime, whenLine } from '../core/i18n';
import type { Block } from '../core/instances';
import { simpleRepeat } from '../core/recurrence';
import { backend } from '../platform/backend';
import { apply, blocksOn, categories, current, detail, form, lang, now, t } from '../state/store';
import { Button, Dialog, Swatches, paint, timeRange, titleOf } from './common';
import { Icon, type IconName } from './Icon';

const FIELD_ICONS: Record<Field['kind'], IconName> = { teacher: 'person', group: 'group', topic: 'book', link: 'link', other: 'list' };

function Linked({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a
            key={i}
            href={part.href}
            onClick={(e) => {
              e.preventDefault();
              void backend.openUrl(part.href!);
            }}
          >
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </>
  );
}

function Row(props: { icon: IconName; label: string; children: ComponentChildren }) {
  return (
    <div class="detail-row">
      <Icon name={props.icon} />
      <span class="detail-label">{props.label}</span>
      <span class="detail-value">{props.children}</span>
    </div>
  );
}

/** How far the event is from now, or that it is on, or over. */
function distance(block: Block): { text: string; kind: 'on' | 'past' | 'ahead' } {
  const at = now.value;
  if (block.start <= at && at < block.end) return { text: t('now'), kind: 'on' };
  if (block.end <= at) return { text: `${t('ended')} · ${relativeDay(lang.value, block.end - 1, at)}`, kind: 'past' };
  return { text: block.allDay ? relativeDay(lang.value, block.start, at) : relativeTime(lang.value, block.start, at), kind: 'ahead' };
}

function Neighbour({ label, block }: { label: string; block: Block | undefined }) {
  if (!block) return <div class="neighbour none"><span class="detail-label">{label}</span><span>–</span></div>;
  return (
    <button type="button" class="neighbour" style={paint(block.head)} onClick={() => (detail.value = block)}>
      <span class="detail-label">{label}</span>
      <span class="neighbour-colors" aria-hidden="true" />
      <span class="neighbour-time">{hm(block.start)}</span>
      <span class="neighbour-title">{titleOf(block).title}</span>
      {block.head.event.location && <span class="neighbour-place">{block.head.event.location}</span>}
    </button>
  );
}

/** `openInApp`: in the small calendar, where changing things is left to the full window. */
export function EventDetail({ block: opened, openInApp }: { block: Block; openInApp?: boolean }) {
  // The calendars may have changed since the dialog opened; show the event as it is now.
  const block = current(opened) ?? opened;
  const inst = block.head;
  const { event, calendar } = inst;
  const { title, cancelled } = titleOf(block);
  const [coloring, setColoring] = useState(false);
  const [asking, setAsking] = useState(false);
  const close = (): void => void (detail.value = null);

  const category = categoryById(categories.value, event.category) ?? categoryById(categories.value, calendar.category);
  const details = parseDetails(event.notes || event.description);
  const repeat = simpleRepeat(event.rrule);
  const far = distance(block);

  // The timed events of the same day, to say what this one sits between.
  const sameDay = block.allDay ? [] : blocksOn(block.start).filter((b) => !b.allDay).sort((a, b) => a.start - b.start);
  const index = sameDay.findIndex((b) => b.key === block.key);

  const pinned = calendar.accents?.[titleKey(event.title)] ?? null;
  const remove = (all: boolean): void => {
    void apply(all || !inst.recurring ? deleteEvent(inst.calId, inst.uid) : deleteOccurrence(inst.calId, inst.uid, inst.start));
    close();
  };

  return (
    <Dialog title={title} onClose={close} class="detail">
      <div class="detail-band" style={paint(inst)}>
        <div class="detail-tags">
          {category && (
            <span class="tag" style={{ background: category.color, color: textOn(category.color) }}>
              {categoryName(category, lang.value)}
            </span>
          )}
          <span class="tag plain">{calendar.name}</span>
          {inst.accent && <span class="tag-swatch" style={{ background: inst.accent }} title={t('secondColor')} />}
        </div>
        <Button icon="palette" title={t('secondColor')} kind="ghost" active={coloring} onClick={() => setColoring(!coloring)} />
        <Button icon="close" title={t('close')} kind="ghost" onClick={close} />
      </div>

      <div class="detail-main">
        <h2 class={cancelled ? 'cancelled' : ''}>{title}</h2>
        <p class="detail-when">
          {whenLine(lang.value, block.start, block.end, block.allDay)}
          <span class={`far ${far.kind}`}>{far.text}</span>
        </p>
        {!block.allDay && (
          <p class="detail-time">
            {timeRange(block.start, block.end)}
            <span>{duration(lang.value, block.end - block.start)}</span>
            {block.parts.length > 1 && <span>{countLessons(lang.value, block.parts.length)}</span>}
          </p>
        )}
        {block.allDay && block.lastDay > block.firstDay && (
          <p class="detail-time">
            {t('allDay')}
            <span>{duration(lang.value, (block.lastDay - block.firstDay + 1) * 86_400_000)}</span>
          </p>
        )}
        {cancelled && <p class="detail-flag"><span class="tag-err">{t('cancelled')}</span></p>}
      </div>

      {coloring && (
        <div class="detail-coloring">
          <p>
            {t('accentFor')} „{titleOf(block).title}“
          </p>
          <div class="coloring-row">
            <Button label={calendar.autoAccent ? t('accentAuto') : t('accentOff')} active={!pinned} onClick={() => void apply(setAccent(inst.calId, event.title, null))} />
            <Swatches
              label={t('secondColor')}
              colors={ACCENT_PALETTE.filter((c) => c !== eventColor(calendar, event, categories.value))}
              value={pinned}
              onPick={(color) => void apply(setAccent(inst.calId, event.title, color))}
            />
          </div>
        </div>
      )}

      <div class="detail-rows">
        {block.parts.length > 1 && (
          <Row icon="clock" label={t('periods')}>
            {block.parts.map((p) => timeRange(p.start, p.end)).join(', ')}
          </Row>
        )}
        {event.location && (
          <Row icon="pin" label={t('location')}>
            <Linked text={event.location} />
          </Row>
        )}
        {details.fields.map((field, i) => (
          <Row key={i} icon={FIELD_ICONS[field.kind]} label={field.label}>
            <Linked text={field.value} />
          </Row>
        ))}
        {repeat !== 'none' && (
          <Row icon="repeat" label={t('repeat')}>
            {t(repeat)}
          </Row>
        )}
        {event.alarmMinutes !== '' && (
          <Row icon="bell" label={t('alarm')}>
            {alarmText(lang.value, event.alarmMinutes)}
          </Row>
        )}
        {details.notes && (
          <div class="detail-notes">
            <Linked text={details.notes} />
          </div>
        )}
      </div>

      {index !== -1 && sameDay.length > 1 && (
        <div class="detail-around">
          <Neighbour label={t('before')} block={sameDay[index - 1]} />
          <Neighbour label={t('after')} block={sameDay[index + 1]} />
        </div>
      )}

      <footer class="dialog-foot">
        {openInApp ? (
          <>
            <span class="spacer" />
            <Button icon="external" label={t('openInApp')} onClick={() => void backend.showMain(ymd(block.start))} />
          </>
        ) : inst.managed ? (
          <p class="managed" title={t('managedHint')}>
            <Icon name="lock" />
            <span>{t('managedHint')}</span>
          </p>
        ) : asking ? (
          <>
            <span class="ask">{inst.recurring ? t('deleteSeriesAsk') : t('confirmDelete')}</span>
            <Button label={t('cancel')} onClick={() => setAsking(false)} />
            {inst.recurring && <Button label={t('deleteOne')} kind="danger" onClick={() => remove(false)} />}
            <Button label={inst.recurring ? t('deleteAll') : t('delete')} kind="danger" onClick={() => remove(true)} />
          </>
        ) : (
          <>
            <Button icon="trash" label={t('delete')} kind="danger" onClick={() => setAsking(true)} />
            <span class="spacer" />
            <Button
              icon="edit"
              label={t('edit')}
              kind="primary"
              onClick={() => {
                form.value = { editing: inst };
                close();
              }}
            />
          </>
        )}
      </footer>
    </Dialog>
  );
}
