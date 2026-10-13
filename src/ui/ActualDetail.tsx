// What the tracker recorded for one stretch of time, and how sure it is.

import { hm } from '../core/dates';
import { duration, longDate } from '../core/i18n';
import type { ActualEntry } from '../platform/backend';
import { lang, t } from '../state/store';
import { Dialog, DialogHead } from './common';
import { actualCategory, actualDetail } from './views/TimeGrid';

export function ActualDetail({ entry }: { entry: ActualEntry }) {
  const close = (): void => void (actualDetail.value = null);
  const start = Date.parse(entry.start);
  const unsure = entry.confidence < 0.5;
  return (
    <Dialog title={t('actual')} onClose={close} class="detail">
      <DialogHead title={entry.title || actualCategory(entry.category)} onClose={close} />
      <div class="detail-rows">
        <p class="detail-when">
          {longDate(lang.value, start)} · {hm(start)} – {hm(Date.parse(entry.end))} · {t('actual')}
        </p>
        {entry.description && <p>{entry.description}</p>}
        <p>
          {actualCategory(entry.category)} · {duration(lang.value, entry.activeSeconds * 1000)} {t('actualActive')} · {t('actualFocus')}{' '}
          {Math.round(entry.focusRatio * 100)} % · {entry.switches} {t('actualSwitches')}
        </p>
        <p class={unsure ? 'problem' : ''}>
          {t('actualConfidence')} {Math.round(entry.confidence * 100)} %{unsure && ` · ${t('actualLow')}`}
        </p>
        {entry.evidence.length > 0 && (
          <>
            <h3>{t('actualEvidence')}</h3>
            <ul class="evidence">
              {entry.evidence.slice(0, 3).map((e, i) => (
                <li key={i}>
                  <span>{e.what || e.app}</span>
                  <span class="field-hint">{e.app} · {duration(lang.value, e.s * 1000)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
        {entry.blockId !== null && (
          <p class="field-hint">
            {t('actualFix')} <code>actually fix {entry.blockId} --task "…" --category {entry.category || 'deep_work'}</code>
          </p>
        )}
      </div>
    </Dialog>
  );
}
