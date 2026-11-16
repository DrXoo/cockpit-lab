// The validation banner and the headline metrics of the checks panel.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';

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
  if (!state.roomEnabled && !state.deskEnabled)
    return { className: 'validation-banner', html: EMPTY_PROJECT };
  const className = `validation-banner ${errors ? 'error' : warnings ? 'warning' : ''}`;
  if (!errors && !warnings) return { className, html: NOTHING_TO_FIX };
  const title = errors
    ? `${plural(errors, 'issue')} to fix`
    : `${plural(warnings, 'detail')} to review`;
  return {
    className,
    html: `<span class="status-icon">${errors ? '×' : '!'}</span><div><strong>${title}</strong><small>${errors ? 'See the checks below.' : 'Check them against your real space.'}</small></div>`,
  };
}

export interface Metrics {
  footprintHTML: string;
  spaceHTML: string;
}

/** The room's inside dimensions, and the footprint of everything set up in it. */
export function metricsView(state: CockpitConfig, e: CockpitEvaluation): Metrics {
  return {
    footprintHTML: `${state.roomW} × ${state.roomD} cm`,
    spaceHTML: `${Math.ceil(e.spaceW)} <small>×</small> ${Math.ceil(e.spaceD)} <small>cm</small>`,
  };
}
