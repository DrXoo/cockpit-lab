// Desk tab: placing the desk, the cockpit and the items on the tabletop, and the monitor position.
import type { CockpitConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { clampEdge, desktopTargets } from './desk.ts';
import { groupHTML as group, type ControlTemplates } from './controls-view.ts';
import {
  armPoseMountMoved,
  AUTOMATIC_MONITOR_MODES,
  MAX_ARM_POSE_NAME_LENGTH,
  monitorPositionOf,
  type MonitorPosition,
} from './arm-poses.ts';
import { escapeHTML } from './html.ts';

/** Multiplication sign, the delete mark of a saved pose. */
const CROSS = '×';

const AUTOMATIC_POSITION_LABELS: Record<(typeof AUTOMATIC_MONITOR_MODES)[number], string> = {
  cockpit: 'Facing the cockpit',
  desk: 'On the desk',
  vr: 'VR · parked',
};

const optionHTML = (value: string, label: string, selected: boolean, disabled = false): string =>
  `<option value="${escapeHTML(value)}"${selected ? ' selected' : ''}${disabled ? ' disabled' : ''}>${escapeHTML(label)}</option>`;

function poseOptionsHTML(s: CockpitConfig, position: MonitorPosition): string {
  if (!s.armPoses.length) return '';
  const options = s.armPoses.map((pose) => {
    const value = `pose:${pose.id}`;
    const selected = position.choice === value;
    const label = selected && position.changed ? `${pose.name} · changed` : pose.name;
    return optionHTML(value, label, selected);
  });
  return `<optgroup label="Your poses">${options.join('')}</optgroup>`;
}

function automaticOptionsHTML(s: CockpitConfig, position: MonitorPosition): string {
  const options = AUTOMATIC_MONITOR_MODES.map((mode) => {
    const value = `auto:${mode}`;
    const unavailable = mode === 'cockpit' && s.cockpitEnabled === false;
    return optionHTML(
      value,
      AUTOMATIC_POSITION_LABELS[mode],
      position.choice === value,
      unavailable,
    );
  });
  return `<optgroup label="Automatic">${options.join('')}</optgroup>`;
}

/** Update and delete for the chosen pose, and a note when its mount has moved. */
function chosenPoseHTML(s: CockpitConfig, position: MonitorPosition): string {
  const pose = s.armPoses.find((candidate) => position.choice === `pose:${candidate.id}`);
  if (!pose) return '';
  const moved = armPoseMountMoved(s, pose)
    ? `<small data-mount-moved="${escapeHTML(pose.id)}">Saved with the arm mounted elsewhere</small>`
    : '';
  return `${moved}<div class="arm-pose-actions"><button id="updateArmPose"${position.changed ? '' : ' disabled'}>Update pose</button><button id="deleteArmPose">Delete pose</button></div>`;
}

/**
 * The monitor position: the layout's saved poses, then the automatic positions. It changes as
 * the arm or its mount moves, so it is redrawn on its own, apart from the field to save a pose.
 * `selectedPoseId` is the pose last chosen, saved or updated.
 */
export function monitorPositionHTML(s: CockpitConfig, selectedPoseId: string): string {
  const position = monitorPositionOf(s, selectedPoseId);
  const custom =
    position.choice === 'custom' ? optionHTML('custom', 'Custom (not saved)', true) : '';
  const hint = s.armPoses.length
    ? ''
    : '<p class="layout-hint" id="armPoseHint">Place the monitor and save the pose to come back to it exactly. Each layout keeps its own poses.</p>';
  return `<div class="select-control"><label for="monitorPosition">Monitor position</label><select id="monitorPosition">${custom}${poseOptionsHTML(s, position)}${automaticOptionsHTML(s, position)}</select></div>${chosenPoseHTML(s, position)}${hint}`;
}

/** The monitor position, and the field to save the current arm as a new pose. */
export function armPosesHTML(s: CockpitConfig, selectedPoseId: string): string {
  return `<div class="arm-pose-area" id="armPoseArea"><div id="monitorPositionArea">${monitorPositionHTML(s, selectedPoseId)}</div><div class="arm-pose-save"><input type="text" id="armPoseName" maxlength="${MAX_ARM_POSE_NAME_LENGTH}" placeholder="Pose name" aria-label="Pose name" autocomplete="off"><button id="saveArmPose">Save as new pose</button></div></div>`;
}

// Shared by step 4 and the complete editor; positions remain local to the desk.
export function deskElementControls(
  s: CockpitConfig,
  e: CockpitEvaluation,
  target: string,
  { range, select }: Pick<ControlTemplates, 'range' | 'select'>,
): string {
  let html = '';
  const item = desktopTargets.find((t) => t.id === target),
    prefix = item ? item.prefix : target;
  // Position settings of the selected item: `<prefix>X`, `<prefix>Z` and `<prefix>Angle`.
  const setting = (suffix: 'X' | 'Z' | 'Angle') => `${prefix}${suffix}` as NumericField;
  const picker = `<div class="select-control target-picker"><label for="layoutTargetSelect">Item to move</label><select id="layoutTargetSelect"><optgroup label="Room layout">${s.cockpitEnabled !== false ? `<option value="cockpit" ${target === 'cockpit' ? 'selected' : ''}>Cockpit</option>` : ''}<option value="desk" ${target === 'desk' ? 'selected' : ''}>Whole desk</option></optgroup><optgroup label="On the desktop">${desktopTargets
    .filter((t) => e.desktopItems.some((i) => i.id === t.id))
    .map((t) => `<option value="${t.id}" ${target === t.id ? 'selected' : ''}>${t.label}</option>`)
    .join('')}</optgroup></select></div>`;
  let placement = '';
  if (target === 'arm') {
    placement += select('clampMount', 'Mount', [
      ['clamp', 'Edge clamp'],
      ['grommet', 'Grommet / drilled hole'],
    ]);
    if (s.clampMount === 'clamp') {
      const edge = clampEdge(s);
      placement +=
        `<div class="select-control"><label for="clampEdgeSelect">Desktop edge</label><select id="clampEdgeSelect">${[
          ['xmin', 'Front (−X)'],
          ['xmax', 'Back (+X)'],
          ['zmin', '−Z end'],
          ['zmax', '+Z end'],
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${edge === value ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></div>` +
        range(edge[0] === 'x' ? 'clampZ' : 'clampX', 'Position along the edge');
    } else
      placement +=
        range('clampX', 'X position on the desktop') + range('clampZ', 'Z position on the desktop');
    placement +=
      '<button class="arm-edit-action" id="armDragBtn">Move monitor and arm ↗</button><p class="layout-hint">This moves the mount, not the screen. A clamp snaps to the nearest edge as you drag it. A grommet mount can sit inside the desktop and needs a drilled hole or a compatible cable grommet.</p>';
  } else {
    placement +=
      range(setting('X'), item ? 'X position on the desktop' : 'X position (sideways)') +
      range(setting('Z'), item ? 'Z position on the desktop' : 'Z position (depth)') +
      range(setting('Angle'), 'Rotation in the plan') +
      `<div class="rotate-actions"><button data-rotate="-90">↶ −90°</button><button data-rotate="90">+90° ↷</button></div>`;
    placement += `<p class="layout-hint" ${item ? 'data-desktop-hint' : ''}>${item ? `Reference: the center of the desktop, which turns with the desk. X runs along its ${s.deskDepth} cm depth; Z along its ${s.deskWidth} cm width.` : target === 'desk' ? 'Reference: the center of the desktop in the room.' : 'Reference: the center of the rear end of the chassis.'} Select and drag in the <b>Desk</b> or <b>Top</b> views. You can also type the position and rotation here.</p>`;
  }
  html += group('Place items', picker + placement, item ? 'On the desktop' : 'In the room');
  if (target === 'keyboard')
    html += group(
      'Keyboard size',
      range('keyboardWidth', 'Keyboard width') + range('keyboardDepth', 'Keyboard depth'),
    );
  if (target === 'pc')
    html += group(
      'PC size',
      range('pcWidth', 'Tower width') +
        range('pcDepth', 'Tower depth') +
        range('pcHeight', 'Tower height'),
    );
  if (target === 'mouse')
    html +=
      '<p class="control-hint">A mouse of about 12 × 7 cm. You can place and turn it separately from the keyboard and the desk mat.</p>';
  if (target === 'mat')
    html += group(
      'XL desk mat',
      `<div class="select-control"><label for="matPreset">Quick size</label><select id="matPreset"><option value="custom">Custom</option><option value="90x40">90 × 40 cm</option><option value="120x60">120 × 60 cm</option><option value="140x80">140 × 80 cm</option></select></div>` +
        range('matWidth', 'Mat width') +
        range('matDepth', 'Mat depth'),
    );
  return html;
}
