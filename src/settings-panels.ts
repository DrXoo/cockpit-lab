// Settings panels of the complete editor. The cockpit editor has the frame and the posture of the
// design; the room editor has the desk and the placement of the cockpit design it links to.
import { round } from './geometry.ts';
import { presets } from './config.ts';
import { bindControls, groupHTML as group, type ControlView } from './controls-view.ts';
import { accessoryControls, placementControls } from './setup-editor.ts';
import { armPosesHTML, deskElementControls } from './desk-editor.ts';
import { escapeHTML as esc } from './html.ts';
import { adjustmentsFromParametric } from './cad/from-parametric.ts';

/** A form to start a cockpit design from one of the bases. */
export function newDesignHTML(): string {
  const options = Object.entries(presets)
    .map(([id, base]) => `<option value="${id}">${esc(base.label)}</option>`)
    .join('');
  return `<form id="newDesignForm"><p class="setup-prompt">This project has no cockpit yet.</p><label class="setup-field" for="newDesignBase">Start from a base<select id="newDesignBase" required><option value="">Choose a base</option>${options}</select></label><p class="layout-hint">You can then adjust the frame, the controls and the posture. A room in this project places the design in every layout.</p><button type="submit" class="button button-dark">Start the design</button></form><p class="setup-alternative">Have a cockpit designed in another project? <button type="button" class="text-button" id="importCockpitInstead">Import a cockpit file</button></p>`;
}

/**
 * The cockpit in the room: the project's design, whether the room includes it, and where this
 * layout puts it. `hasDesign` says whether the project has a design at all.
 */
export function cockpitPlacementHTML(view: ControlView, hasDesign: boolean): string {
  const { state } = view;
  if (!hasDesign)
    return group(
      'Cockpit design',
      '<p class="layout-hint">This project has no cockpit design yet. Design one, then add it to the room.</p><button class="arm-edit-action" id="editCockpitDesign">Design a cockpit →</button>',
    );
  const design = `<p class="design-summary"><b>${esc(presets[state.preset].label)}</b> · chassis ${round(state.length)} × ${round(state.width)} cm · driver ${round(state.height)} cm</p>`;
  const edit =
    '<button class="arm-edit-action" id="editCockpitDesign">Edit the cockpit design →</button>';
  if (!state.cockpitEnabled)
    return group(
      'Cockpit design',
      design +
        '<p class="layout-hint">The room leaves the cockpit out. Add it to place it in every layout, each at its own position.</p><button class="button button-dark" id="includeCockpit">Add the cockpit to the room</button>' +
        edit,
    );
  const { range } = bindControls(view);
  return (
    group(
      'Cockpit design',
      design +
        edit +
        '<p class="layout-hint">The room shows the cockpit design of the project and only places it. A change to the design shows in every layout.</p>',
    ) +
    placementControls('cockpit', range) +
    '<button class="text-button" id="leaveOutCockpit">Leave the cockpit out of the room</button><p class="layout-hint">Every layout leaves it out and keeps its position for when it comes back. The design stays in the project.</p>'
  );
}

export function framePanelHTML(view: ControlView): string {
  const { range, toggle, select } = bindControls(view);
  let html = '';
  html += group(
    'Aluminium base',
    range('length', 'Chassis length') +
      range('width', 'Outer width') +
      range('baseLift', 'Base lift') +
      '<p class="layout-hint">Raises the seat, wheel, pedals and side controls together, keeping your posture. 0 cm keeps the original base. The feet or casters stay on the floor. The desk and the monitor keep their height.</p>',
    '40 × 80 / 40 × 40',
  );
  html += group(
    'Modules and controls',
    toggle('wheel', 'Wheel and DD base') +
      toggle('hotas', 'Side HOTAS') +
      toggle('centerStick', 'Center stick') +
      toggle('shifter', 'H-pattern shifter') +
      toggle('handbrake', 'Handbrake') +
      select('drivingSide', 'Shifter and handbrake side', [
        ['right', "Driver's right"],
        ['left', "Driver's left"],
      ]) +
      select('feet', 'Feet', [
        ['level', 'Leveling feet'],
        ['casters', 'Locking casters'],
      ]),
  );
  html += mountsGroup(view);
  html +=
    '<p class="control-hint">Right and left for the shifter and handbrake are seen from the driving seat. Fixed chassis with removable modules. The total width includes the active accessories. The profile selection is preliminary; it does not calculate stiffness for your DD base.</p>';
  return html;
}

/** Heights, tilts and side positions change the parts that carry each module. */
function mountsGroup(view: ControlView): string {
  const { range } = bindControls(view);
  const { state } = view;
  let controls = range('seatH', 'Seat cushion height');
  if (state.wheel)
    controls += range('wheelH', 'Wheel center height') + range('wheelTilt', 'Wheel base tilt');
  controls += range('pedalH', 'Pedal deck height') + range('pedalTilt', 'Pedal deck tilt');
  if (state.hotas || state.shifter || state.handbrake)
    controls +=
      range('hotasZ', 'Side controls fore-aft') +
      range('hotasH', 'Side plate height') +
      range('hotasOut', 'Side plate outset');
  if (state.centerStick)
    controls +=
      range('stickZ', 'Center stick fore-aft') + range('stickH', 'Center stick plate height');
  return group('Mounts', controls, 'From the rear / floor');
}

export function posturePanelHTML(view: ControlView): string {
  const { range, toggle } = bindControls(view);
  const { state } = view;
  const travels = new Map(
    adjustmentsFromParametric(state).map((adjustment) => [adjustment.partId, adjustment]),
  );
  const travelHint = (partId: string) => {
    const adjustment = travels.get(partId);
    if (!adjustment) return '';
    return `<p class="layout-hint">${esc(adjustment.name)}: ${adjustment.travelMm} mm of travel.</p>`;
  };
  let html = '';
  html += group(
    'Your starting point',
    range('height', 'Your height') + toggle('vrHeadset', 'VR headset'),
  );
  html += group(
    'Seat',
    range('seatZ', 'Fore-aft position') + travelHint('seat') + range('recline', 'Backrest recline'),
    'From the rear',
  );
  if (state.wheel)
    html += group('Wheel', range('wheelZ', 'Fore-aft position') + travelHint('wheel-plate'));
  html += group('Pedals', range('pedalZ', 'Fore-aft position') + travelHint('pedal-plate'));
  html +=
    '<p class="control-hint">Fit the cockpit to your body with what slides: the seat on its rails and the plates in their slots. Their travels are estimates, and for now moving one also moves its supports. Heights, tilts and the side controls are in Frame → Mounts. Positions are measured from the rear end of the chassis; recline from vertical. Show the driver to explore the posture.</p>';
  return html;
}

/** `selectedPose` is the arm pose last chosen, saved or updated, or '' for none. */
export function deskPanelHTML(view: ControlView, layoutTarget: string, selectedPose = ''): string {
  const { range, toggle, select } = bindControls(view);
  const { state, evaluation } = view;
  let html = '';
  html += accessoryControls(toggle);
  const size = `${state.deskWidth}x${state.deskDepth}`;
  html += group(
    'Desktop',
    `<div class="select-control"><label for="deskSizePreset">Quick size</label><select id="deskSizePreset"><option value="custom">Custom</option>${['120x60', '120x80', '140x60', '140x80', '160x80', '180x80', '200x80'].map((value) => `<option value="${value}" ${value === size ? 'selected' : ''}>${value.replace('x', ' × ')} cm</option>`).join('')}</select></div>` +
      range('deskWidth', 'Desktop width') +
      range('deskDepth', 'Desktop depth') +
      '<p class="layout-hint">Width × depth. Items keep their size and move back onto the desktop when they fit. The reference legs stay 66 cm deep.</p>',
    'Width × depth',
  );
  if (state.monitorEnabled !== false) {
    html += group(
      'Monitor and arm',
      armPosesHTML(state, selectedPose) +
        `<button class="arm-edit-action" id="armControlsDragBtn">Edit the joints in the plan ↗</button>` +
        range('armBaseAngle', 'Base rotation') +
        range('armElbowAngle', 'Elbow bend') +
        range('monitorYaw', 'Screen rotation (VESA)') +
        select('armBend', 'Bend direction', [
          ['positive', 'Elbow to one side'],
          ['negative', 'Elbow to the other side'],
        ]) +
        range('monitorH', 'VESA center height') +
        range('monitorAhead', 'Screen ahead of the wheel') +
        range('monitorInches', 'Screen diagonal') +
        '<p class="layout-hint">Drag <b>ELBOW</b> to turn the first segment or <b>VESA</b> to move the end. The rotation controls switch to manual mode. The automatic positions work out the angles towards a target; save a pose to keep the angles you choose, and update it after moving the arm.</p>',
    ).replace('<div class="control-group">', '<div class="control-group" id="armControls">');
    html += group(
      'Arm dimensions',
      range('armReach', 'Total segment length') +
        range('armSplit', 'First segment (% of total)') +
        `<p class="layout-hint" id="armLengths">First segment: ${round(evaluation.armPose.first)} cm · second segment: ${round(evaluation.armPose.second)} cm. An elbow at 0° keeps the arm straight; ±180° folds it.</p>` +
        range('armMinH', 'Minimum VESA height') +
        range('armMaxH', 'Maximum VESA height'),
      'Generic 2-segment model',
    );
  }
  html += deskElementControls(state, evaluation, layoutTarget, { range, select });
  if (state.cockpitEnabled !== false)
    html += group(
      'Quick placement',
      `<div class="select-control"><label for="layoutPreset">Desk relative to the cockpit</label><select id="layoutPreset"><option value="free">Custom</option><option value="right">Desk on the right</option><option value="left">Desk on the left</option><option value="front">Desk in front</option></select></div>`,
    );
  html += group('Desk height', range('deskH', 'Desktop height'), 'Height from the floor');
  html += '<button class="arm-edit-action" id="goRoom">Room, doors and furniture ↗</button>';
  html +=
    '<p class="control-hint">The desk and the cockpit are positioned and turned separately. The room stays fixed as you move them. The arm keeps two segments of fixed length and checks its minimum/maximum reach and VESA height. Rotations are in the plan; check the stops and loads of the real model. Diagonal in inches (″), everything else in cm. Set up walls, doors, windows and furniture in the Room tab.</p>';
  return html;
}
