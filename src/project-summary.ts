// The printable project summary: a partial one while the project is incomplete, and the full
// one with geometry, cut list and checks. Lengths in cm unless a column says mm.
import { escapeHTML as esc } from './html.ts';
import { formatNumber } from './number-format.ts';
import { checkLineHTML } from './check-view.ts';
import { steps, type SetupProgress } from './project.ts';
import { presets, type CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { wallFrame } from './room.ts';
import { round } from './geometry.ts';
import { wrapAngle } from './monitor-arm.ts';
import { rigLift, floorHeight } from './rig.ts';

/** Elements that must all be present for the full summary. */
const SUMMARY_ELEMENTS = [
  'deskEnabled',
  'cockpitEnabled',
  'monitorEnabled',
  'keyboardEnabled',
  'pcEnabled',
  'mouseEnabled',
  'matEnabled',
] as const;

/** The full summary needs a finished setup with the room and every element. */
export const usesPartialSummary = (s: CockpitConfig, setup: SetupProgress): boolean =>
  !s.roomEnabled || setup.step !== 'complete' || SUMMARY_ELEMENTS.some((key) => s[key] === false);

export const summaryHeading = (s: CockpitConfig) =>
  s.cockpitEnabled
    ? { title: 'Your cockpit, piece by piece.', kicker: 'FROM DESIGN TO WORKSHOP' }
    : { title: 'Project summary', kicker: 'YOUR SPACE' };

type Cell = string | number;
type Row = [label: string, value: Cell];

const row = (label: string, value: Cell): Row => [label, value];

const title = (text: string) => `<h3 class="summary-title">${text}</h3>`;
const dims = (rows: Row[]) =>
  `<div class="summary-dims">${rows.map(([key, value]) => `<p>${esc(key)}<b>${esc(value)}</b></p>`).join('')}</div>`;
const table = (head: string[], rows: Cell[][]) =>
  `<table class="summary-table"><thead><tr>${head.map((v) => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function partialSummary(
  s: CockpitConfig,
  e: CockpitEvaluation,
  setup: SetupProgress,
  roomHTML = '',
): string {
  let html = '<div class="summary-inner">';
  const pending = setup.deferred
    .map((id) => steps.find((step) => step.id === id)?.label)
    .filter(Boolean);
  if (setup.step !== 'complete')
    html += `<p class="summary-note">Project in progress · ${esc(steps.find((step) => step.id === setup.step)?.label || 'Room')} step. Only the items added so far are included.</p>`;
  if (pending.length)
    html += `<p class="summary-note">Still to do: ${pending.map(esc).join(', ')}.</p>`;
  html += title('Your space');
  html += s.roomEnabled
    ? dims([
        ['Room · width × depth', `${s.roomW} × ${s.roomD} cm`],
        ['Ceiling height', `${s.roomH} cm`],
      ])
    : '<p>The room is not set up yet.</p>';
  html += roomHTML;
  if (s.deskEnabled) {
    html +=
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
          [
            'Mode',
            { cockpit: 'Cockpit', desk: 'Desk', manual: 'Manual', vr: 'VR · parked' }[
              s.monitorMode
            ],
          ],
          ['Arm segments', `${e.armPose.first} + ${e.armPose.second} cm`],
          ['Reach needed', `${Math.round(e.reach)} cm`],
          [
            'Base / elbow / VESA rotation',
            `${e.armPose.baseAngle.toFixed(1)}° / ${e.armPose.elbowAngle.toFixed(1)}° / ${wrapAngle(e.monitorAngle - s.deskAngle).toFixed(1)}°`,
          ],
        ]);
  }
  if (s.cockpitEnabled) {
    html +=
      '<p class="summary-note">Heights from the floor, including the base lift. Positions from the rear end of the chassis.</p>';
    html +=
      title('Cockpit') +
      dims([
        ['Chassis', `${s.length} × ${s.width} cm`],
        ['Base lift', `${rigLift(s)} cm · chassis axis ${10 + rigLift(s)} cm above the floor`],
        ['Height', `${s.height} cm`],
        ['Seat · position / height', `${s.seatZ} / ${floorHeight(s, 'seatH')} cm`],
        ['Recline', `${s.recline}°`],
        ['Position X / Z', `${s.cockpitX} / ${s.cockpitZ} cm`],
        ['Rotation', `${s.cockpitAngle}°`],
      ]);
    html += dims([
      [
        'Pedals · position / height',
        `${s.pedalZ} / ${floorHeight(s, 'pedalH')} cm · ${s.pedalTilt}°`,
      ],
      ...(s.wheel
        ? [
            row(
              'Wheel · position / height',
              `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°`,
            ),
          ]
        : []),
      ...(s.hotas || s.shifter || s.handbrake
        ? [
            row(
              'Side controls · position / height',
              `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · outset ${s.hotasOut} cm`,
            ),
          ]
        : []),
      ...(s.centerStick
        ? [row('Center stick · position / height', `${s.stickZ} / ${floorHeight(s, 'stickH')} cm`)]
        : []),
      [
        'Shifter and handbrake',
        s.shifter || s.handbrake
          ? s.drivingSide === 'left'
            ? "Driver's left"
            : "Driver's right"
          : 'Off',
      ],
      ['Approximate net profile', `${formatNumber(e.totalMm / 1000)} m · ${e.cuts} cuts`],
    ]);
    html +=
      title('Approximate cut list') +
      table(
        ['Part', 'Profile (mm)', 'Qty', 'Length (mm)', 'Total (mm)'],
        e.parts.map((p) => [p.name, p.profile, p.qty, p.mm, p.total]),
      );
  }
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
  if (s.cockpitEnabled)
    html +=
      '<p class="summary-note">Approximate dimensions and checks based on envelopes. The side clearance does not guarantee a way in. Cuts are net lengths without the saw kerf. Base extensions need joints and bracing still to be designed; their fasteners are not included in the estimates. Fasteners are estimates from the configurator; check dimensions, mounting patterns, slot size, loads and mounts before building. This is not a validated fabrication drawing.</p>';
  else if (s.roomEnabled)
    html +=
      '<p class="summary-note">The checks use approximate envelopes. The side clearance does not guarantee a continuous way in.</p>';
  html += '</div>';
  return html;
}

export function roomSummaryHTML(s: CockpitConfig): string {
  if (s.roomEnabled === false) return '';
  const a = esc;
  return `<h3 class="summary-title">Room and obstacles<span>Dimensions in cm</span></h3><table class="summary-table"><thead><tr><th>Item</th><th>Location</th><th>Size / swing</th></tr></thead><tbody>${s.roomFeatures.map((v) => `<tr><td>${a(v.name)}</td><td>Wall ${wallFrame(s, v.wall).corner} · start ${v.offset}</td><td>${v.type === 'wardrobeAccess' ? `Sliding doors · width ${v.width} · height ${v.height} · clear access in front ${v.clearance}` : `${v.width} × ${v.height} · ${v.type === 'door' ? v.openAngle + '° ' + (v.swing === 'in' ? 'inwards' : 'outwards') : 'sill ' + v.sill + ' · clearance ' + v.clearance}`}</td></tr>`).join('')}${s.roomFurniture.map((v) => `<tr><td>${a(v.name)}</td><td>${v.type === 'wallShelf' ? `Wall ${wallFrame(s, v.mountWall).corner} · start ${v.offset} · bottom ${v.elevation} cm` : `X ${round(v.x - s.roomX)} / Z ${round(v.z - s.roomZ)} · ${v.angle}°`}</td><td>${v.width} × ${v.depth} × ${v.height}${v.type === 'chair' ? ` · seat ${v.seatHeight} · pull-back ${v.pullback}` : ''}</td></tr>`).join('')}</tbody></table>`;
}

export function fullSummaryHTML(s: CockpitConfig, e: CockpitEvaluation): string {
  const fmt = (v: number) => formatNumber(v, 2);
  const dims = [
    ['Preset', presets[s.preset].label],
    ['Reference height', `${s.height} cm`],
    ['Base lift', `${rigLift(s)} cm · chassis axis ${10 + rigLift(s)} cm above the floor`],
    ['Outer chassis', `${s.length} × ${s.width} cm`],
    ['Width with accessories', `${Math.ceil(e.rigRight - e.rigLeft)} cm`],
    ['Seat · position / height', `${s.seatZ} / ${floorHeight(s, 'seatH')} cm`],
    ['Backrest from vertical', `${s.recline}°`],
    [
      'Wheel · position / center',
      s.wheel ? `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°` : 'Off',
    ],
    [
      'Pedals · position / height',
      `${s.pedalZ} / ${floorHeight(s, 'pedalH')} cm · ${s.pedalTilt}°`,
    ],
    [
      'Side controls · pos. / height',
      s.hotas || s.shifter || s.handbrake
        ? `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · outset ${s.hotasOut}`
        : 'Off',
    ],
    [
      'Shifter and handbrake · side',
      s.shifter || s.handbrake
        ? s.drivingSide === 'left'
          ? "Driver's left"
          : "Driver's right"
        : 'Off',
    ],
    [
      'Center stick · pos. / height',
      s.centerStick ? `${s.stickZ} / ${floorHeight(s, 'stickH')} cm` : 'Off',
    ],
    ['Desk · desktop / height', `${s.deskWidth} × ${s.deskDepth} / ${s.deskH} cm`],
    ['Desk · position X / Z', `${s.deskX} / ${s.deskZ} cm`],
    ['Desk · rotation in the plan', `${s.deskAngle}°`],
    ['Cockpit · position X / Z', `${s.cockpitX} / ${s.cockpitZ} cm`],
    ['Cockpit · rotation in the plan', `${s.cockpitAngle}°`],
    ['Room · width / depth / height', `${s.roomW} / ${s.roomD} / ${s.roomH} cm`],
    ['Room · origin X / Z', `${s.roomX} / ${s.roomZ} cm`],
    ['Monitor · diagonal / height', `${s.monitorInches}″ / ${s.monitorH} cm`],
    [
      'Monitor · mode',
      {
        cockpit: 'Cockpit',
        desk: 'Desk',
        vr: 'VR · parked',
        manual: 'Manual joints',
      }[s.monitorMode],
    ],
    ['Mount · X / Z on the desktop', `${s.clampX} / ${s.clampZ} cm`],
    ['Mount · type', s.clampMount === 'grommet' ? 'Grommet' : 'Clamp'],
    ['Arm · needed / rated', `${Math.round(e.reach)} / ${s.armReach} cm`],
    ['Arm · base / end segments', `${round(e.armPose.first)} / ${round(e.armPose.second)} cm`],
    [
      'Arm · base / elbow / VESA',
      `${round(e.armPose.baseAngle)}° / ${round(e.armPose.elbowAngle)}° / ${round(wrapAngle(e.monitorAngle - s.deskAngle))}°`,
    ],
    ['Free area / desired walkway', `${s.roomW} × ${s.roomD} / ${s.aisle} cm`],
  ];
  return `<div class="summary-inner"><div class="summary-stats"><div><small>Outer chassis</small><b>${s.length} × ${s.width} cm</b></div><div><small>Setup without walkway</small><b>${Math.ceil(e.spaceW)} × ${Math.ceil(e.spaceD)} cm</b></div><div><small>Net profile / +10% to buy</small><b>${fmt(e.totalMm / 1000)} / ${fmt((e.totalMm / 1000) * 1.1)} m</b></div><div><small>Aluminium cuts</small><b>${e.cuts} pieces</b></div></div><h3 class="summary-title">Your design geometry<span>Heights from the floor · positions from the rear</span></h3><div class="summary-dims">${dims.map(([n, v]) => `<p>${n}<b>${v}</b></p>`).join('')}</div>${roomSummaryHTML(s)}<h3 class="summary-title">On the desk<span>Coordinates from the center of the desktop</span></h3><table class="summary-table"><thead><tr><th>Item</th><th>Footprint X × Z (cm)</th><th>Position X / Z (cm)</th><th>Rotation</th></tr></thead><tbody>${e.desktopItems.map((i) => `<tr><td>${i.label}</td><td>${i.sizeX} × ${i.sizeZ}${i.id === 'pc' ? ` · h ${s.pcHeight}` : ''}</td><td>${i.local.x} / ${i.local.z}</td><td>${i.local.angle}°</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Checks<span>${e.errors} to fix · ${e.warnings} warnings</span></h3><div class="summary-checks">${e.checks.map(checkLineHTML).join('')}</div><h3 class="summary-title">Approximate cut list<span>Net lengths · without saw kerf</span></h3><table class="summary-table"><thead><tr><th>Part</th><th>Profile (mm)</th><th>Qty</th><th>Length (mm)</th><th>Total (mm)</th></tr></thead><tbody>${e.parts.map((p) => `<tr><td>${p.name}</td><td>${p.profile}</td><td>${p.qty}</td><td>${p.mm}</td><td>${p.total}</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Parts and fasteners<span>Preliminary quantities</span></h3><table class="summary-table"><thead><tr><th>Component</th><th>Detail</th><th>Qty</th></tr></thead><tbody>${e.accessories.map((p) => `<tr><td>${p.name}</td><td>${p.note}</td><td>${p.qty}</td></tr>`).join('')}</tbody></table><div class="summary-note"><b>Before you order or cut:</b> base extensions need joints and bracing still to be designed; their fasteners are not included in the estimates. The part list assumes outer side rails with crossmembers between their inner faces (width − 80 mm), the base axis ${(10 + rigLift(s)) * 10} mm above the floor and modules on corner brackets. The cushion height is a target body measurement: adapt the supports to the thickness and rails of your seat. Plates are modeled as envelopes, without holes. Add a cutting allowance and check the slot size, brackets, plate thickness, mounts and load with your supplier. This is not a structural calculation or a validated fabrication drawing. Standard 40 × 80 profiles do not telescope into each other. The arm uses two fixed-length segments with horizontal rotations; check the real VESA pattern, weight, rotation stops and travel.</div></div>`;
}
