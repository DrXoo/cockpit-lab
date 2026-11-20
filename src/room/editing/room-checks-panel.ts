// The room editor's side of the inspector: the room's and the desk's checks, their sizes, the
// monitor arm's reach and the space the layout leaves free.
import { checkRowHTML } from '../../ui/check-view.ts';
import type { RoomConfig } from '../config.ts';
import { $ } from '../../ui/dom.ts';
import type { CockpitEvaluation } from '../evaluate.ts';
import { metricsView, validationBanner } from './inspector-view.ts';
import { round } from '../model.ts';

const PERCENT = 100;

/**
 * Shows the checks of the layout `shown`, which is the active layout `state` in the room editor
 * and an empty room in the cockpit editor; the sizes are always the active layout's.
 */
export function renderRoomChecks(
  state: RoomConfig,
  shown: RoomConfig,
  evaluation: CockpitEvaluation,
) {
  const e = evaluation;
  $('#roomInspector').hidden = shown.roomEnabled === false;
  $('#roomSizeTag').textContent = `${state.roomW} × ${state.roomD}`;
  $('#roomChecks').innerHTML = [...e.extra.filter((c) => c.id === 'room'), ...e.room.checks]
    .map(checkRowHTML)
    .join('');
  $('#desktopChecks').innerHTML = e.desktopChecks.map(checkRowHTML).join('');
  $('#matTag').textContent = `${state.matWidth} × ${state.matDepth}`;
  $('#deskSizeTag').textContent = `${state.deskWidth} × ${state.deskDepth}`;
  $('#spaceChecks').innerHTML = [
    ...e.spaceCheck,
    ...e.extra.filter((c) => c.id !== 'room' && c.level !== 'ok'),
  ]
    .map(checkRowHTML)
    .join('');
  const banner = validationBanner(shown, e);
  $('#validationBanner').className = banner.className;
  $('#validationBanner').innerHTML = banner.html;
  const maxReach = round(e.armPose.maxReach);
  $('#reachValue').textContent = `${Math.round(e.reach)} / ${maxReach} cm`;
  $('#reachMax').textContent = `Max. ${maxReach} cm`;
  $('#reachMeter').style.width = `${Math.min(PERCENT, (e.reach / e.armPose.maxReach) * PERCENT)}%`;
  $('#reachMeter').classList.toggle('over', e.reach > e.armPose.maxReach);
  const metrics = metricsView(shown, e);
  $('#metricFootprint').innerHTML = metrics.footprintHTML;
  $('#metricSpace').innerHTML = metrics.spaceHTML;
}
