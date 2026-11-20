// The printable project summary: the room, the desk with its accessories and monitor, and the
// checks. Lengths in cm.
import { escapeHTML as esc } from '../ui/html.ts';
import { checkLineHTML } from '../ui/check-view.ts';
import { steps, type SetupProgress } from './project.ts';
import type { RoomConfig, MonitorMode } from '../room/config.ts';
import type { CockpitEvaluation } from '../room/evaluate.ts';
import { wallFrame } from '../room/room.ts';
import { round } from '../shared/geometry.ts';
import { wrapAngle } from '../room/monitor-arm.ts';

export const SUMMARY_HEADING = { title: 'Project summary', kicker: 'YOUR SPACE' };

const MONITOR_MODE_LABELS: Record<MonitorMode, string> = {
  desk: 'Desk',
  manual: 'Manual',
  vr: 'VR · parked',
};

type Cell = string | number;

const title = (text: string) => `<h3 class="summary-title">${text}</h3>`;
const dims = (rows: [label: string, value: Cell][]) =>
  `<div class="summary-dims">${rows.map(([key, value]) => `<p>${esc(key)}<b>${esc(value)}</b></p>`).join('')}</div>`;
const table = (head: string[], rows: Cell[][]) =>
  `<table class="summary-table"><thead><tr>${head.map((v) => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;

function progressHTML(setup: SetupProgress): string {
  let html = '';
  const pending = setup.deferred
    .map((id) => steps.find((step) => step.id === id)?.label)
    .filter(Boolean);
  if (setup.step !== 'complete')
    html += `<p class="summary-note">Project in progress · ${esc(steps.find((step) => step.id === setup.step)?.label || 'Room')} step. Only the items added so far are included.</p>`;
  if (pending.length)
    html += `<p class="summary-note">Still to do: ${pending.map(esc).join(', ')}.</p>`;
  return html;
}

function deskHTML(s: RoomConfig, e: CockpitEvaluation): string {
  let html =
    title('Desk') +
    dims([
      ['Desktop · width × depth', `${s.deskWidth} × ${s.deskDepth} cm`],
      ['Height', `${s.deskH} cm`],
      ['Position X / Z', `${s.deskX} / ${s.deskZ} cm`],
      ['Rotation', `${s.deskAngle}°`],
    ]);
  if (e.desktopItems.length)
    html +=
      title('Accessories added') +
      table(
        ['Item', 'Footprint X × Z (cm)', 'Position X / Z (cm)', 'Rotation'],
        e.desktopItems.map((i) => [
          i.label,
          `${i.sizeX} × ${i.sizeZ}`,
          `${i.local.x} / ${i.local.z}`,
          `${i.local.angle}°`,
        ]),
      );
  if (s.monitorEnabled)
    html +=
      title('Monitor and arm') +
      dims([
        ['Diagonal', `${s.monitorInches}″`],
        ['VESA height', `${s.monitorH} cm`],
        ['Mode', MONITOR_MODE_LABELS[s.monitorMode]],
        ['Arm segments', `${e.armPose.first} + ${e.armPose.second} cm`],
        ['Reach needed', `${Math.round(e.reach)} cm`],
        [
          'Base / elbow / VESA rotation',
          `${e.armPose.baseAngle.toFixed(1)}° / ${e.armPose.elbowAngle.toFixed(1)}° / ${wrapAngle(e.monitorAngle - s.deskAngle).toFixed(1)}°`,
        ],
      ]);
  return html;
}

export function summaryHTML(s: RoomConfig, e: CockpitEvaluation, setup: SetupProgress): string {
  let html = '<div class="summary-inner">' + progressHTML(setup);
  html += title('Your space');
  html += s.roomEnabled
    ? dims([
        ['Room · width × depth', `${s.roomW} × ${s.roomD} cm`],
        ['Ceiling height', `${s.roomH} cm`],
      ])
    : '<p>The room is not set up yet.</p>';
  html += roomSummaryHTML(s);
  if (s.deskEnabled) html += deskHTML(s, e);
  if (e.accessories.length)
    html +=
      title('Parts and fasteners') +
      table(
        ['Component', 'Detail', 'Qty'],
        e.accessories.map((p) => [p.name, p.note, p.qty]),
      );
  if (e.checks.length)
    html +=
      title('Checks') + `<div class="summary-checks">${e.checks.map(checkLineHTML).join('')}</div>`;
  if (s.roomEnabled)
    html +=
      '<p class="summary-note">The checks use approximate envelopes. The side clearance does not guarantee a continuous way in.</p>';
  html += '</div>';
  return html;
}

export function roomSummaryHTML(s: RoomConfig): string {
  if (s.roomEnabled === false) return '';
  const a = esc;
  return `<h3 class="summary-title">Room and obstacles<span>Dimensions in cm</span></h3><table class="summary-table"><thead><tr><th>Item</th><th>Location</th><th>Size / swing</th></tr></thead><tbody>${s.roomFeatures.map((v) => `<tr><td>${a(v.name)}</td><td>Wall ${wallFrame(s, v.wall).corner} · start ${v.offset}</td><td>${v.type === 'wardrobeAccess' ? `Sliding doors · width ${v.width} · height ${v.height} · clear access in front ${v.clearance}` : `${v.width} × ${v.height} · ${v.type === 'door' ? v.openAngle + '° ' + (v.swing === 'in' ? 'inwards' : 'outwards') : 'sill ' + v.sill + ' · clearance ' + v.clearance}`}</td></tr>`).join('')}${s.roomFurniture.map((v) => `<tr><td>${a(v.name)}</td><td>${v.type === 'wallShelf' ? `Wall ${wallFrame(s, v.mountWall).corner} · start ${v.offset} · bottom ${v.elevation} cm` : `X ${round(v.x - s.roomX)} / Z ${round(v.z - s.roomZ)} · ${v.angle}°`}</td><td>${v.width} × ${v.depth} × ${v.height}${v.type === 'chair' ? ` · seat ${v.seatHeight} · pull-back ${v.pullback}` : ''}</td></tr>`).join('')}</tbody></table>`;
}
