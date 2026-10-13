// Small pieces every part of the interface uses.

import type { CSSProperties, ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { isHex, textOn } from '../core/colors';
import { hm } from '../core/dates';
import { splitCancelled } from '../core/details';
import type { Block } from '../core/instances';
import type { Instance } from '../core/types';
import { settings, t } from '../state/store';
import { Icon, type IconName } from './Icon';

/**
 * The colours of an event as CSS variables. An event with two colours is drawn
 * as a fill and a stripe; which colour is which is the user's choice.
 */
export function paint(inst: Pick<Instance, 'color' | 'accent'>): CSSProperties {
  const accentFills = settings.value.dualFill === 'accent';
  const fill = accentFills ? (inst.accent ?? inst.color) : inst.color;
  const stripe = accentFills ? inst.color : (inst.accent ?? inst.color);
  return { '--fill': fill, '--stripe': stripe, '--ink': textOn(fill) };
}

export function titleOf(block: Block): { title: string; cancelled: boolean } {
  const { title, cancelled } = splitCancelled(block.head.event.title);
  return { title: title || t('untitled'), cancelled };
}

export function timeRange(start: number, end: number): string {
  return end > start ? `${hm(start)} – ${hm(end)}` : hm(start);
}

export function Button(props: {
  icon?: IconName;
  label?: string;
  title?: string;
  kind?: 'plain' | 'primary' | 'danger' | 'ghost';
  active?: boolean;
  disabled?: boolean;
  onClick: (e: MouseEvent) => void;
  class?: string;
}) {
  const classes = ['btn', props.kind ?? 'plain', props.label ? '' : 'icon-only', props.active ? 'active' : '', props.class ?? ''];
  return (
    <button
      type="button"
      class={classes.filter(Boolean).join(' ')}
      title={props.title}
      aria-label={props.label ?? props.title}
      aria-pressed={props.active}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.icon && <Icon name={props.icon} />}
      {props.label && <span>{props.label}</span>}
    </button>
  );
}

/** A window over the app: Escape or a click beside it closes it. */
export function Dialog(props: { title: string; onClose: () => void; children: ComponentChildren; class?: string; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    // The field the dialog is about, else its first field; a dialog of buttons only takes the focus itself.
    const first = box.current?.querySelector<HTMLElement>('[data-focus]') ?? box.current?.querySelector<HTMLElement>('input, select, textarea');
    (first ?? box.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  // Escape closes it wherever the focus is: a button that was just pressed may be
  // gone from the dialog, and the focus with it. Listening from the moment the
  // dialog is there, not a frame later: a key pressed in between would be lost.
  const close = useRef(props.onClose);
  close.current = props.onClose;
  useLayoutEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      class="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div
        ref={box}
        class={`dialog ${props.wide ? 'wide' : ''} ${props.class ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
      >
        {props.children}
      </div>
    </div>
  );
}

export function DialogHead(props: { title: string; onClose: () => void; children?: ComponentChildren }) {
  return (
    <header class="dialog-head">
      <h2>{props.title}</h2>
      {props.children}
      <Button icon="close" title={t('close')} kind="ghost" onClick={props.onClose} />
    </header>
  );
}

/** A row of colours to pick one from; `value` null means none is picked. */
export function Swatches(props: { colors: readonly string[]; value: string | null; onPick: (color: string) => void; label: string }) {
  return (
    <div class="swatches" role="radiogroup" aria-label={props.label}>
      {props.colors.map((color) => (
        <button
          type="button"
          key={color}
          class={`swatch ${props.value?.toLowerCase() === color.toLowerCase() ? 'picked' : ''}`}
          style={{ background: color, color: textOn(color) }}
          role="radio"
          aria-checked={props.value?.toLowerCase() === color.toLowerCase()}
          aria-label={color}
          title={color}
          onClick={() => props.onPick(color)}
        >
          {props.value?.toLowerCase() === color.toLowerCase() && <Icon name="check" />}
        </button>
      ))}
    </div>
  );
}

/** A colour picked from a row of them, or typed as #rrggbb. */
export function ColorPick(props: { colors: readonly string[]; value: string; onPick: (color: string) => void; label: string }) {
  return (
    <span class="accent-pick">
      <Swatches label={props.label} colors={props.colors} value={props.value} onPick={props.onPick} />
      <input
        type="text"
        class="hex"
        aria-label="#rrggbb"
        value={props.value}
        maxLength={7}
        onInput={(e) => {
          if (isHex(e.currentTarget.value)) props.onPick(e.currentTarget.value.toLowerCase());
        }}
      />
    </span>
  );
}

/** A labelled line of a form. */
export function Field(props: { label: string; icon?: IconName; children: ComponentChildren; hint?: string }) {
  return (
    <label class="field">
      <span class="field-label">
        {props.icon && <Icon name={props.icon} />}
        {props.label}
      </span>
      <span class="field-control">
        {props.children}
        {props.hint && <span class="field-hint">{props.hint}</span>}
      </span>
    </label>
  );
}
