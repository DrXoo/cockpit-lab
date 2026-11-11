// The validation banner and the headline metrics of the checks panel.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { formatNumber } from './number-format.ts';

const EMPTY_PROJECT =
  '<span class="status-icon">1</span><div><strong>Set up your space</strong><small>Checks appear as you add items.</small></div>';
const NOTHING_TO_FIX =
  '<span class="status-icon">✓</span><div><strong>No interference found</strong><small>Only the items you added are checked.</small></div>';

const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

export interface Banner {
  className: string;
  html: string;
}

/** The overall result. Each level shows a symbol as well as its colour. */
export function validationBanner(
  state: CockpitConfig,
  { errors, warnings }: Pick<CockpitEvaluation, 'errors' | 'warnings'>,
): Banner {
  if (!state.roomEnabled && !state.deskEnabled && !state.cockpitEnabled)
    return { className: 'validation-banner', html: EMPTY_PROJECT };
  const className = `validation-banner ${errors ? 'error' : warnings ? 'warning' : ''}`;
  if (!state.cockpitEnabled && !errors && !warnings) return { className, html: NOTHING_TO_FIX };
  const title = errors
    ? `${plural(errors, 'issue')} to fix`
    : warnings
      ? `${plural(warnings, 'detail')} to review`
      : 'A good starting point';
  return {
    className,
    html: `<span class="status-icon">${errors ? '×' : warnings ? '!' : '✓'}</span><div><strong>${title}</strong><small>${errors ? 'See the checks below.' : 'Confirm the posture with your real equipment.'}</small></div>`,
  };
}

export interface Metrics {
  footprintHTML: string;
  widthNote: string;
  spaceHTML: string;
  profilesHTML: string;
  piecesText: string;
}

/** Without a cockpit, the first metric shows the room instead of the chassis. */
export function metricsView(state: CockpitConfig, e: CockpitEvaluation): Metrics {
  return {
    footprintHTML: state.cockpitEnabled
      ? `${state.length} <small>×</small> ${state.width} <small>cm</small>`
      : `${state.roomW} × ${state.roomD} cm`,
    widthNote: state.cockpitEnabled
      ? `${Math.ceil(e.rigRight - e.rigLeft)} cm with accessories`
      : 'Inside dimensions',
    spaceHTML: `${Math.ceil(e.spaceW)} <small>×</small> ${Math.ceil(e.spaceD)} <small>cm</small>`,
    profilesHTML: `${formatNumber(e.totalMm / 1000, 2)} <small>m</small>`,
    piecesText: `${e.cuts} cuts · 40 series`,
  };
}
