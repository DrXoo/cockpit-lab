// The cockpit editor's panels: the design history on the left, with the tools that add to it,
// and the inspector of the selected part on the right. The design is shown on its own, in an
// empty workspace without any room. Cockpit files are imported from the actions above the panel.
import {
  faceAxis,
  type Axis,
  type ContactPoint,
  type ContactRole,
  type Face,
  type Vec3Mm,
} from './cad/assembly.ts';
import {
  connectorType,
  footType,
  footTypes,
  peripheralTypes,
  profileSection,
  profileSystem,
  sheetType,
  sheetTypes,
  type PeripheralCategory,
} from './cad/catalog.ts';
import type { JointOfPart } from './cad/fastening.ts';
import {
  FACES,
  facingParts,
  isAdjustable,
  isBolts,
  lengthAxisOf,
  makesAPart,
  makesAProfile,
  MAX_BACKREST_DEG,
  MAX_BOLTS_PER_SLOT,
  MAX_ENVELOPE_SIDE_MM,
  MAX_HOLE_DIAMETER_MM,
  MAX_PART_NAME_LENGTH,
  MAX_PLATE_SIDE_MM,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MAX_TRAVEL_MM,
  MIN_ENVELOPE_SIDE_MM,
  MIN_PLATE_SIDE_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  stepTitle,
  type AddAnchoredProfile,
  type AddFoot,
  type AddPlate,
  type Adjustment,
  type AdjustableOperation,
  type FastenJoint,
  type FootValues,
  type GrowProfile,
  type MountPeripheral,
  type PeripheralValues,
  type ProfileOperation,
  type Operation,
  type ParentEnd,
  type PlateValues,
  type ProfileValues,
} from './cad/history.ts';
import { differsFromItsType } from './cad/peripherals.ts';
import type { Hole } from './cad/plate.ts';
import { defaults, type RoomConfig } from './room/config.ts';
import { round } from './shared/geometry.ts';
import { escapeHTML } from './ui/html.ts';

/** What surrounds a design in its own workspace: nothing. */
export const NOTHING_AROUND: RoomConfig = {
  ...defaults,
  roomEnabled: false,
  deskEnabled: false,
  monitorEnabled: false,
  keyboardEnabled: false,
  pcEnabled: false,
  mouseEnabled: false,
  matEnabled: false,
  roomFeatures: [],
  roomFurniture: [],
  armPoses: [],
};

export interface DesignPanel {
  history: readonly Operation[];
  /** The history marker: how many steps the view shows. */
  marker: number;
  selectedOperationId: string | null;
  /** Why each failed operation no longer applies, by operation id. */
  failures: ReadonlyMap<string, string>;
  canUndo: boolean;
  canRedo: boolean;
  /** Whether the design is being fitted, which locks the frame. */
  fitting?: boolean;
}

/** The fields of the inspector, as the markup names them in `data-part-field`. */
const PART_FIELDS = [
  'name',
  'sectionId',
  'axis',
  'heightAxis',
  'lengthMm',
  'startX',
  'startY',
  'startZ',
  'face',
  'fromEnd',
  'alongMm',
  'acrossMm',
  'way',
  'reachesId',
  'footTypeId',
  'sheetId',
  'widthMm',
  'depthMm',
  'depthAxis',
  'facing',
  'typeId',
  'heightMm',
  'backrestDeg',
  'holeXMm',
  'holeYMm',
  'holeDiameterMm',
  'contactXMm',
  'contactYMm',
  'contactZMm',
] as const;
export type PartField = (typeof PART_FIELDS)[number];

const AXIS_NAMES: Record<Axis, string> = {
  x: 'Across (X)',
  y: 'Up (Y)',
  z: 'Front to back (Z)',
};
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const START_FIELDS: Record<Axis, PartField> = { x: 'startX', y: 'startY', z: 'startZ' };

/** The faces of a part as the driver sees them: +Y is up, +Z the front, −X the driver's right. */
const SIDE_FACE_NAMES: Record<Face, string> = {
  '+y': 'Top (+Y)',
  '-y': 'Underside (−Y)',
  '+x': 'Left side (+X)',
  '-x': 'Right side (−X)',
  '+z': 'Front (+Z)',
  '-z': 'Back (−Z)',
};
/** The faces at the ends of a profile, named for the end they close. */
const END_FACE_NAMES: Record<Face, string> = {
  '+y': 'Top end (+Y)',
  '-y': 'Bottom end (−Y)',
  '+x': 'Left end (+X)',
  '-x': 'Right end (−X)',
  '+z': 'Front end (+Z)',
  '-z': 'Back end (−Z)',
};
/** The ways a profile lying on a face can run, as the driver sees them. */
const DIRECTION_NAMES: Record<Face, string> = {
  '+x': 'towards the left (+X)',
  '-x': 'towards the right (−X)',
  '+y': 'upwards (+Y)',
  '-y': 'downwards (−Y)',
  '+z': 'towards the front (+Z)',
  '-z': 'towards the back (−Z)',
};
/** The ends of a profile along each axis: its start has the lower coordinate. */
const END_NAMES: Record<Axis, Record<ParentEnd, string>> = {
  x: { start: 'Right end (−X)', end: 'Left end (+X)' },
  y: { start: 'Bottom end', end: 'Top end' },
  z: { start: 'Back end', end: 'Front end' },
};

const sectionName = (widthMm: number, heightMm: number) => `${widthMm} × ${heightMm}`;

/** The history panel: the design's operations, the undo and redo of its edits, and its tools. */
export function designPanelHTML(panel: DesignPanel): string {
  const editTools = `<div class="history-tools"><button class="text-button" id="undoEdit" title="Undo (Ctrl+Z)" ${panel.canUndo ? '' : 'disabled'}><i data-icon="undo"></i>Undo</button><button class="text-button" id="redoEdit" title="Redo (Ctrl+Y)" ${panel.canRedo ? '' : 'disabled'}><i data-icon="redo"></i>Redo</button></div>`;
  const locked = panel.fitting
    ? ' disabled title="The frame is locked while fitting: turn Fit off to add a profile"'
    : '';
  const addProfile = `<button class="button button-dark history-add" id="addProfile"${locked}><i data-icon="plus"></i>Add a profile</button>`;
  if (panel.history.length === 0) {
    // Nothing to undo in a new design; after undoing back to empty, redo brings the parts back.
    const tools = panel.canUndo || panel.canRedo ? editTools : '';
    return `<div class="control-group" id="emptyDesign"><h3 class="group-title">A design built from parts</h3>${tools}<p class="layout-hint">A cockpit design is the list of steps that builds it from aluminium profiles, plates and peripherals. New designs start empty: add a profile to start.</p><p class="layout-hint">Cockpits of the earlier configurator are not converted: design them again from parts.</p>${addProfile}</div>`;
  }
  const { history, marker } = panel;
  const steps = history.map((_, index) => historyStepHTML(panel, index));
  steps.splice(marker, 0, historyMarkerHTML(marker, history.length));
  const atTheMarker =
    marker < history.length ? ' New steps go in at the marker, and the steps below it wait.' : '';
  return `<div class="control-group" id="designHistory"><h3 class="group-title">Design history<span>${history.length} ${history.length === 1 ? 'step' : 'steps'}</span></h3>${editTools}<ol class="history-list">${steps.join('')}</ol>${addProfile}<p class="layout-hint">Select a part here or in the view to edit it in the inspector. Grow new profiles out of its faces from there.${atTheMarker}</p></div>`;
}

/** The history marker: the view shows the design up to it. */
function historyMarkerHTML(marker: number, steps: number): string {
  const back = marker === 0 ? ' disabled' : '';
  const forward = marker === steps ? ' disabled' : '';
  return `<li class="history-marker" id="historyMarker"><span>▶ The view shows the design up to here</span><span class="marker-actions"><button class="text-button" id="markerBack" title="Show the design one step earlier"${back}>Step back</button><button class="text-button" id="markerForward" title="Show the next step"${forward}>Step forward</button><button class="text-button" id="markerEnd" title="Show every step"${forward}>To the end</button></span></li>`;
}

function historyStepHTML(panel: DesignPanel, index: number) {
  const { history } = panel;
  const operation = history[index];
  const selected = operation.id === panel.selectedOperationId;
  const failure = panel.failures.get(operation.id);
  const waiting = index >= panel.marker;
  const classes = `history-step${failure !== undefined ? ' failed' : ''}${waiting ? ' after-marker' : ''}`;
  const part = makesAPart(operation) ? ` data-part="${escapeHTML(operation.partId)}"` : '';
  const failed =
    failure === undefined
      ? ''
      : `<small class="history-failure">⚠ Failed: ${escapeHTML(failure)}</small>`;
  return `<li><button class="${classes}" data-operation="${escapeHTML(operation.id)}"${part} aria-pressed="${selected}"${waiting ? ' disabled' : ''}><span class="history-number">${index + 1}</span><span class="history-text"><strong>${escapeHTML(stepTitle(history, operation))}</strong><small>${stepDetail(history, operation)}</small>${failed}</span></button></li>`;
}

function stepDetail(history: readonly Operation[], operation: Operation): string {
  switch (operation.kind) {
    case 'remove-part':
      return 'What hangs from it stays where it is, anchored';
    case 'add-foot':
      return `Under ${escapeHTML(nameOf(history, operation.parentId))} · ${escapeHTML(footType(operation.footTypeId).name)}`;
    case 'fasten-joint':
      return escapeHTML(connectorCountText(operation));
    case 'join-parts':
      return 'They touch: a joint to fasten';
    case 'mount-peripheral':
      return `Mounted on ${escapeHTML(nameOf(history, operation.parentId))} · ${CATEGORY_NAMES[operation.category]}`;
    case 'add-plate':
      return `On ${escapeHTML(nameOf(history, operation.parentId))} · ${round(operation.widthMm, 1)} × ${round(operation.depthMm, 1)} mm · ${escapeHTML(sheetType(operation.sheetId).name)}`;
    case 'add-anchored-profile':
    case 'grow-profile':
      return profileStepDetail(history, operation);
  }
}

function profileStepDetail(history: readonly Operation[], operation: ProfileOperation): string {
  const section = profileSection(profileSystem(operation.systemId), operation.sectionId);
  const made =
    operation.kind === 'add-anchored-profile'
      ? 'Anchored profile'
      : `${operation.way === 'out' ? 'Grown out of' : 'Laid on'} ${escapeHTML(parentName(history, operation))}${reachText(history, operation)}`;
  return `${made} · ${sectionName(section.widthMm, section.heightMm)} · ${round(operation.lengthMm, 1)} mm`;
}

/**
 * How many connectors of each type a fastening puts on its joint, such as "2 × 40 corner
 * bracket", or how many bolts go in each slot of a plate's.
 */
function connectorCountText(fastening: FastenJoint): string {
  const bolts = fastening.connectors.find(isBolts);
  if (bolts) return `${boltCount(bolts.perSlot)} in each slot`;
  const counts = new Map<string, number>();
  for (const { typeId } of fastening.connectors) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  return [...counts]
    .map(([typeId, count]) => `${count} × ${connectorType(typeId).name}`)
    .join(', ');
}

const nameOf = (history: readonly Operation[], partId: string): string =>
  operationMaking(history, partId)?.name ?? 'a deleted part';

const parentName = (history: readonly Operation[], growth: GrowProfile): string =>
  operationMaking(history, growth.parentId)?.name ?? growth.parentId;

/** The axis a part's length runs along, when an operation made it as a profile. */
function profileAxisOf(history: readonly Operation[], partId: string): Axis | null {
  const operation = operationMaking(history, partId);
  return operation && makesAProfile(operation) ? lengthAxisOf(operation) : null;
}

/** What a span reaches, and whether its end still meets it. */
interface Reach {
  targetName: string;
  meets: boolean;
}

function reachOf(history: readonly Operation[], operation: ProfileOperation): Reach | null {
  if (operation.kind !== 'grow-profile' || operation.reachesId === undefined) return null;
  const resolved = replayDesign(history).resolved.get(operation.partId);
  return {
    targetName: operationMaking(history, operation.reachesId)?.name ?? operation.reachesId,
    meets: resolved !== undefined && !resolved.openEnd,
  };
}

function reachText(history: readonly Operation[], growth: GrowProfile): string {
  const reach = reachOf(history, growth);
  if (!reach) return '';
  const target = escapeHTML(reach.targetName);
  return reach.meets ? `, reaching ${target}` : ` · ⚠ not meeting ${target}`;
}

/**
 * The inspector of the selected step: the values of the operation that made a part, with what
 * can be done with that part, or the part a removal takes away. A failed step says why, and its
 * values can still be changed to fix it.
 */
export function partInspectorHTML(
  history: readonly Operation[],
  operation: Operation | undefined,
  failure?: string,
  joints: readonly JointOfPart[] = [],
  touching: readonly TouchingPart[] = [],
  { fitting = false }: Mode = {},
): string {
  if (!operation)
    return `<p class="control-hint" id="noPartSelected">Select a part in the view or in the design history to edit it.</p>`;
  if (fitting && !isAPeripheral(operation)) return lockedStepHTML(history, operation, failure);
  const deleteStep = `<button class="button button-light" id="deleteStep" title="Take this step out of the whole history"><i data-icon="trash"></i>Delete this step</button>`;
  const failed =
    failure === undefined
      ? ''
      : `<p class="layout-hint part-warning">⚠ Failed: ${escapeHTML(failure)} It adds nothing until it applies again.</p>`;
  switch (operation.kind) {
    case 'remove-part':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Removes <strong>${escapeHTML(nameOf(history, operation.removedId))}</strong> from this step on: the parts that hung from it stay where they are, anchored, and spans that reached it keep their length. Earlier steps still have it.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'fasten-joint':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Puts ${escapeHTML(connectorCountText(operation))} on the joint of <strong>${escapeHTML(nameOf(history, operation.partId))}</strong> to <strong>${escapeHTML(nameOf(history, operation.toPartId))}</strong>. Change its connectors from the inspector of either part.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'join-parts':
      return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Joins <strong>${escapeHTML(nameOf(history, operation.partId))}</strong> to <strong>${escapeHTML(nameOf(history, operation.toPartId))}</strong>, which it touches, so the joint can take connectors and carries support. Fasten it from the inspector of either part.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
    case 'mount-peripheral':
      return `<div class="part-inspector" id="partInspectorFields">${failed}${peripheralInspectorHTML(history, operation)}${fitting ? adjustmentHTML(operation) : ''}<div class="part-actions">${deleteStep}</div></div>`;
    case 'add-foot':
      return partFieldsHTML(footFieldsHTML(history, operation));
    case 'add-plate':
      return partFieldsHTML(plateFieldsHTML('part', history, operation));
    case 'add-anchored-profile':
    case 'grow-profile':
      return partFieldsHTML(
        profileFieldsHTML('part', history, operation, { reach: failure === undefined }),
      );
  }

  /** The fields of a part of the frame, with its joints and the deletion of its step. */
  function partFieldsHTML(fields: string): string {
    return `<div class="part-inspector" id="partInspectorFields">${failed}${fields}${jointsHTML(joints, touching)}<div class="part-actions">${deleteStep}</div></div>`;
  }
}

/** An action on the selected part, from the toolbar of the view. */
export type PartTool =
  'grow' | 'plate' | 'foot' | 'remove' | 'mount-seat' | 'mount-wheel-base' | 'mount-pedals';

/** Whether the design is being fitted to the driver, in the Fit mode of the view. */
export interface Mode {
  fitting?: boolean;
}

const isAPeripheral = (operation: Operation) => operation.kind === 'mount-peripheral';

/**
 * The tools the view offers for the selected step. Designing, a profile grows a profile, takes a
 * plate and a foot, and any part of the frame can be removed. Fitting, a profile or a plate
 * takes a peripheral, and a peripheral can be removed. A failed step, or one that makes no part,
 * has none.
 */
export function partToolsOf(
  operation: Operation | undefined,
  failure?: string,
  { fitting = false }: Mode = {},
): PartTool[] {
  if (!operation || failure !== undefined || !makesAPart(operation)) return [];
  if (isAPeripheral(operation)) return fitting ? ['remove'] : [];
  if (fitting)
    return makesAProfile(operation) || operation.kind === 'add-plate'
      ? ['mount-seat', 'mount-wheel-base', 'mount-pedals']
      : [];
  return makesAProfile(operation) ? ['grow', 'plate', 'foot', 'remove'] : ['remove'];
}

/**
 * A step of the frame while fitting: it can be selected, but not changed, other than moving its
 * part along an adjustment.
 */
function lockedStepHTML(
  history: readonly Operation[],
  operation: Operation,
  failure: string | undefined,
): string {
  const failed =
    failure === undefined
      ? ''
      : `<p class="layout-hint part-warning">⚠ Failed: ${escapeHTML(failure)}</p>`;
  const adjustment = isAdjustable(operation) ? adjustmentHTML(operation) : '';
  return `<div class="part-inspector" id="lockedPart"><p class="part-parent"><strong>${escapeHTML(stepTitle(history, operation))}</strong></p><p class="layout-hint">🔒 The frame is locked while fitting the driver: turn Fit off to change it.</p>${failed}${adjustment}</div>`;
}

/** The values of an adjustment, as the markup names them in `data-adjustment-field`. */
const ADJUSTMENT_FIELDS = ['axis', 'travelMm', 'positionMm'] as const;
export type AdjustmentField = (typeof ADJUSTMENT_FIELDS)[number];

/**
 * A part's adjustment while fitting: the axis of its face it slides along, its travel and where
 * it is along it; or a button to give it one. A span takes its length from the part it reaches,
 * so it has none.
 */
function adjustmentHTML(operation: AdjustableOperation): string {
  const heading = '<h4 class="buy-group">Adjustment</h4>';
  if (operation.kind === 'grow-profile' && operation.reachesId !== undefined)
    return `${heading}<p class="layout-hint" id="adjustmentNone">A span takes its length from the part it reaches, so it does not slide.</p>`;
  const { adjustment } = operation;
  if (adjustment === undefined)
    return `${heading}<p class="layout-hint">Fixed where it is attached.</p><div class="part-actions"><button class="button button-light" id="addAdjustment" title="Let it slide along the face it hangs from, as a seat on its rails"><i data-icon="plus"></i>Add an adjustment</button></div>`;
  const normal = faceAxis(operation.face);
  const axes = AXES.filter((axis) => axis !== normal)
    .map(
      (axis) =>
        `<option value="${axis}"${axis === adjustment.axis ? ' selected' : ''}>${AXIS_NAMES[axis]}</option>`,
    )
    .join('');
  const halfMm = adjustment.travelMm / 2;
  return `${heading}<div class="select-control"><label for="adjustmentAxis">Slides along</label><select id="adjustmentAxis" data-adjustment-field="axis">${axes}</select></div>${adjustmentNumberHTML('adjustmentTravel', 'travelMm', 'Travel', adjustment.travelMm, 1, MAX_TRAVEL_MM)}${adjustmentNumberHTML('adjustmentPosition', 'positionMm', 'Position', adjustment.positionMm, -halfMm, halfMm)}<p class="layout-hint">Centered where it is attached, towards + on its axis. Moving it along its travel changes no part or cut.</p><div class="part-actions"><button class="button button-light" id="removeAdjustment" title="Fix it at the center of its travel"><i data-icon="trash"></i>Remove the adjustment</button></div>`;
}

function adjustmentNumberHTML(
  id: string,
  field: AdjustmentField,
  label: string,
  valueMm: number,
  min: number,
  max: number,
): string {
  return `<div class="control"><div class="control-top"><label for="${id}">${label}</label><div class="number-wrap"><input id="${id}" type="number" data-adjustment-field="${field}" min="${round(min, 1)}" max="${round(max, 1)}" step="1" value="${round(valueMm, 1)}"><span>mm</span></div></div></div>`;
}

/** The adjustment value a `data-adjustment-field` names. The markup is the app's. */
export function adjustmentField(value: string | undefined): AdjustmentField {
  const field = ADJUSTMENT_FIELDS.find((known) => known === value);
  if (!field) throw new Error(`Unknown adjustment field: ${value}`);
  return field;
}

/** The change a value typed in an adjustment field makes. */
export function adjustmentChange(field: AdjustmentField, value: string): Partial<Adjustment> {
  switch (field) {
    case 'axis':
      return { axis: axisOf(value) };
    case 'travelMm':
      return { travelMm: typedNumber(value) };
    case 'positionMm':
      return { positionMm: typedNumber(value) };
  }
}

/**
 * The joints of the selected part, with their connectors: a corner bracket can be put on or
 * taken off each side of the joined part where it fits, or two at once along the part it meets.
 */
function jointsHTML(joints: readonly JointOfPart[], touching: readonly TouchingPart[]): string {
  if (joints.length === 0 && touching.length === 0) return '';
  const joins = touching
    .map(
      ({ partId, name }) =>
        `<button class="text-button" data-join="${escapeHTML(partId)}" title="Make a joint where they touch"><i data-icon="plus"></i>Join to ${escapeHTML(name)}</button>`,
    )
    .join('');
  const touchingHTML = touching.length
    ? `<div class="joint-row" id="touchingParts"><p class="joint-name"><strong>Touching, without a joint</strong><small>Join them to fasten them and count them as support.</small></p><div class="joint-sides">${joins}</div></div>`
    : '';
  return `<div class="part-joints" id="partJoints"><h4 class="buy-group">Joints</h4>${joints.map((joint) => jointHTML(joint)).join('')}${touchingHTML}</div>`;
}

/** How many bolts the plate's joint takes in each slot it covers, two at once by default. */
export const QUICK_BOLTS_PER_SLOT = 2;

/** A plate's joint to a profile: the bolts in each slot it covers, or why it takes none. */
function boltedJointHTML(
  joint: JointOfPart,
  bolts: { perSlot: number; slots: number },
  fieldPrefix: string,
): string {
  const id = escapeHTML(joint.jointId);
  const toPart = escapeHTML(joint.toPartName);
  const total = bolts.perSlot * bolts.slots;
  const slots = `${bolts.slots} ${bolts.slots === 1 ? 'slot' : 'slots'}`;
  const status =
    bolts.perSlot === 0
      ? '⚠ No bolts yet'
      : `✓ ${boltCount(total)}, ${bolts.perSlot} in each of ${slots}`;
  const name = `<p class="joint-name"><strong>${escapeHTML(joint.partName)} to ${toPart}</strong><small>${status}</small></p>`;
  if (bolts.slots === 0)
    return `<div class="joint-row" data-joint-row="${id}">${name}<p class="layout-hint">It covers no slot of ${toPart}: move it over one to bolt it.</p></div>`;
  const field = `<div class="control"><div class="control-top"><label for="${fieldPrefix}-${id}">Bolts in each slot</label><div class="number-wrap"><input id="${fieldPrefix}-${id}" type="number" data-joint-bolts="${id}" min="0" max="${MAX_BOLTS_PER_SLOT}" step="1" value="${bolts.perSlot}"><span>of ${slots}</span></div></div></div>`;
  const quick =
    bolts.perSlot === QUICK_BOLTS_PER_SLOT
      ? ''
      : `<button class="button button-light" data-joint-two-bolts="${id}" title="Spaced evenly along ${toPart}"><i data-icon="plus"></i>Two in each slot</button>`;
  return `<div class="joint-row" data-joint-row="${id}">${name}${field}${quick}</div>`;
}

/**
 * What the card of a joint marker in the view shows: a joint, or two parts that only touch. The
 * part is the one its inspector shows.
 */
export type JointCard =
  | { kind: 'joint'; partId: string; joint: JointOfPart }
  | { kind: 'touching'; partId: string; partName: string; toPartId: string; toPartName: string };

/** The card of a joint marker: its two parts, its state and its quick actions. */
export function jointCardHTML(card: JointCard): string {
  const more = `<button class="text-button" data-joint-more="${escapeHTML(card.partId)}">More in the inspector</button>`;
  if (card.kind === 'joint') return `${jointHTML(card.joint, 'card-bolts')}${more}`;
  const toName = escapeHTML(card.toPartName);
  const name = `<p class="joint-name"><strong>${escapeHTML(card.partName)} and ${toName}</strong><small>+ Touching, without a joint</small></p>`;
  const join = `<button class="button button-light" data-join="${escapeHTML(card.toPartId)}" data-join-from="${escapeHTML(card.partId)}" title="Make a joint where they touch"><i data-icon="plus"></i>Join to ${toName}</button>`;
  return `<div class="joint-row">${name}${join}</div>${more}`;
}

/** A part that touches the selected one without a joint, to join it to. */
export interface TouchingPart {
  partId: string;
  name: string;
}

const boltCount = (count: number) => `${count} ${count === 1 ? 'bolt' : 'bolts'}`;

/** A joint with its state and connectors; `fieldPrefix` keeps the ids of two of them apart. */
function jointHTML(joint: JointOfPart, fieldPrefix = 'bolts'): string {
  if (joint.bolts !== null) return boltedJointHTML(joint, joint.bolts, fieldPrefix);
  const id = escapeHTML(joint.jointId);
  const count = joint.sides.length;
  const status =
    count === 0
      ? '⚠ No connectors yet'
      : `✓ ${count} corner ${count === 1 ? 'bracket' : 'brackets'}`;
  const sides = joint.fittingSides
    .map((side) => {
      const on = joint.sides.includes(side);
      return `<button class="text-button joint-side" data-joint="${id}" data-side="${side}" aria-pressed="${on}" title="${on ? 'Take away the bracket on this side' : 'Put a corner bracket on this side'}">${on ? '✓' : '+'} ${SIDE_FACE_NAMES[side]}</button>`;
    })
    .join('');
  const missingAlong = joint.alongSides.some((side) => !joint.sides.includes(side));
  const quick = missingAlong
    ? `<button class="button button-light" data-joint-brackets="${id}" title="One on each side along ${escapeHTML(joint.toPartName)}"><i data-icon="plus"></i>Two corner brackets</button>`
    : '';
  const choices =
    joint.fittingSides.length === 0
      ? '<p class="layout-hint">No connector in the catalog fits this joint yet: a corner bracket needs a part that meets a face end on, with room for its legs.</p>'
      : `<div class="joint-sides">${sides}</div>${quick}`;
  return `<div class="joint-row" data-joint-row="${id}"><p class="joint-name"><strong>${escapeHTML(joint.partName)} to ${escapeHTML(joint.toPartName)}</strong><small>${status}</small></p>${choices}</div>`;
}

/** The values of a foot: its type and where it stands under its profile. */
function footFieldsHTML(history: readonly Operation[], foot: AddFoot): string {
  const fields = new FieldTemplates('part');
  const types = footTypes().map((type): [string, string] => [type.id, escapeHTML(type.name)]);
  const parentAxis = profileAxisOf(history, foot.parentId) ?? 'z';
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[parentAxis][end],
  ]);
  const place =
    parentAxis === 'y'
      ? '<p class="layout-hint">Under an upright it stands under its bottom end.</p>'
      : `${fields.select('fromEnd', 'Measured from', ends, foot.fromEnd)}${fields.number('alongMm', 'Distance to its center', foot.alongMm, 0, MAX_PROFILE_LENGTH_MM)}`;
  const type = footType(foot.footTypeId);
  return `${nameFieldHTML('part', foot.name)}<p class="part-parent">Stands under <strong>${escapeHTML(nameOf(history, foot.parentId))}</strong></p>${fields.select('footTypeId', 'Type', types, foot.footTypeId)}<p class="layout-hint">${type.heightMm} mm tall, ${type.widthMm} × ${type.depthMm} mm on the floor${type.source.kind === 'estimated' ? ' (estimated: check the chosen product)' : ''}.</p>${place}`;
}

/** The values of a plate: its sheet, its size and where its center is on its profile. */
function plateFieldsHTML(prefix: string, history: readonly Operation[], plate: AddPlate): string {
  const fields = new FieldTemplates(prefix);
  const sheets = sheetTypes().map((sheet): [string, string] => [sheet.id, escapeHTML(sheet.name)]);
  const sheet = sheetType(plate.sheetId);
  const profileAxis = profileAxisOf(history, plate.parentId) ?? 'z';
  const onAnEnd = faceAxis(plate.face) === profileAxis;
  const faces = FACES.filter(
    (face) => faceAxis(face) !== profileAxis || (onAnEnd && face === plate.face),
  ).map((face): [string, string] => [
    face,
    faceAxis(face) === profileAxis ? END_FACE_NAMES[face] : SIDE_FACE_NAMES[face],
  ]);
  const depthAxes = AXES.filter((axis) => axis !== faceAxis(plate.face)).map(
    (axis): [string, string] => [axis, AXIS_NAMES[axis]],
  );
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[profileAxis][end],
  ]);
  const side = (field: PartField, label: string, valueMm: number) =>
    fields.number(field, label, valueMm, MIN_PLATE_SIDE_MM, MAX_PLATE_SIDE_MM);
  const estimated =
    sheet.source.kind === 'estimated' ? ' (estimated: check the chosen supplier)' : '';
  const sheetHint = `<p class="layout-hint">${sheet.thicknessMm} mm thick${estimated}.</p>`;
  const place = `${fields.select('face', 'Face', faces, plate.face)}${fields.select('depthAxis', 'Depth along', depthAxes, plate.depthAxis)}${fields.select('fromEnd', 'Measured from', ends, plate.fromEnd)}${fields.number('alongMm', 'Distance to its center', plate.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset of its center across the face', plate.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  return `${nameFieldHTML(prefix, plate.name)}<p class="part-parent">Rests on <strong>${escapeHTML(nameOf(history, plate.parentId))}</strong></p>${fields.select('sheetId', 'Sheet', sheets, plate.sheetId)}${sheetHint}${side('widthMm', 'Width', plate.widthMm)}${side('depthMm', 'Depth', plate.depthMm)}${place}<p class="layout-hint">Its center may lie beyond the face, between two profiles, as long as the plate rests on part of it.</p>`;
}

/** What each kind of peripheral is called in the history, and in a sentence. */
const CATEGORY_NAMES: Record<PeripheralCategory, string> = {
  seat: 'Seat',
  'wheel-base': 'Wheel base',
  pedals: 'Pedals',
};
const CATEGORY_NOUNS: Record<PeripheralCategory, string> = {
  seat: 'seat',
  'wheel-base': 'wheel base',
  pedals: 'pedal set',
};

/** The axis a place on a part is measured along: a profile's length or a plate's depth. */
function alongAxisOfPart(history: readonly Operation[], partId: string): Axis | null {
  const operation = operationMaking(history, partId);
  if (!operation) return null;
  if (makesAProfile(operation)) return lengthAxisOf(operation);
  return operation.kind === 'add-plate' ? operation.depthAxis : null;
}

/** Where a peripheral's mounting origin is on its part, and the way it faces. */
function peripheralPlaceHTML(
  prefix: string,
  history: readonly Operation[],
  peripheral: MountPeripheral,
): string {
  const fields = new FieldTemplates(prefix);
  const parent = operationMaking(history, peripheral.parentId);
  const alongAxis = alongAxisOfPart(history, peripheral.parentId) ?? 'z';
  // A plate carries a peripheral on either of its faces, never on its edges.
  const faceChoices =
    parent?.kind === 'add-plate'
      ? FACES.filter((face) => faceAxis(face) === faceAxis(parent.face))
      : FACES;
  const faces = faceChoices.map((face): [string, string] => [
    face,
    parent?.kind !== 'add-plate' && faceAxis(face) === alongAxis
      ? END_FACE_NAMES[face]
      : SIDE_FACE_NAMES[face],
  ]);
  const facings = FACES.filter((face) => faceAxis(face) !== faceAxis(peripheral.face)).map(
    (face): [string, string] => [face, capitalized(DIRECTION_NAMES[face])],
  );
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[alongAxis][end],
  ]);
  const onAnEnd = parent?.kind !== 'add-plate' && faceAxis(peripheral.face) === alongAxis;
  const place = onAnEnd
    ? '<p class="layout-hint">On an end face it is mounted at the center of the end.</p>'
    : `${fields.select('fromEnd', 'Measured from', ends, peripheral.fromEnd)}${fields.number('alongMm', 'Distance to its mounting origin', peripheral.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset across the face', peripheral.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  return `${fields.select('face', 'Face', faces, peripheral.face)}${fields.select('facing', 'Faces', facings, peripheral.facing)}${place}<p class="layout-hint">Its mounting origin is the center of its underside. It faces the way the driver does when using it.</p>`;
}

const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const mountedOnHTML = (history: readonly Operation[], peripheral: MountPeripheral) =>
  `<p class="part-parent">Mounted on <strong>${escapeHTML(nameOf(history, peripheral.parentId))}</strong></p>`;

const ESTIMATED_PERIPHERAL_HINT = 'estimated: measure the chosen product';

/**
 * The inspector of a mounted peripheral: its name, its type, where it is mounted, and the values
 * copied from its type, which describe the product: its envelope, backrest, mounting holes and
 * contact points.
 */
function peripheralInspectorHTML(
  history: readonly Operation[],
  peripheral: MountPeripheral,
): string {
  const fields = new FieldTemplates('part');
  const types = peripheralTypes().map((type): [string, string] => [type.id, escapeHTML(type.name)]);
  if (!types.some(([id]) => id === peripheral.typeId))
    types.push([escapeHTML(peripheral.typeId), 'A type no longer in the catalog']);
  const source = differsFromItsType(peripheral)
    ? '✎ Edited from its type: swapping the type replaces these values.'
    : peripheral.source.kind === 'estimated'
      ? `The values of its type, ${ESTIMATED_PERIPHERAL_HINT}.`
      : 'The values of its type.';
  const type = `${fields.select('typeId', 'Type', types, peripheral.typeId)}<p class="layout-hint">${source}</p>`;
  const place = peripheralPlaceHTML('part', history, peripheral);
  const ownValues = `${envelopeHTML(fields, peripheral)}${mountingPatternHTML(peripheral.mountingPattern.holes)}${contactPointsHTML(peripheral.contactPoints)}`;
  return `${nameFieldHTML('part', peripheral.name)}${mountedOnHTML(history, peripheral)}${type}${place}${ownValues}`;
}

/** A peripheral's envelope, and a seat's backrest, which leans back from upright. */
function envelopeHTML(fields: FieldTemplates, peripheral: MountPeripheral): string {
  const { widthMm, heightMm, depthMm } = peripheral.envelope;
  const side = (field: PartField, label: string, valueMm: number) =>
    fields.number(field, label, valueMm, MIN_ENVELOPE_SIDE_MM, MAX_ENVELOPE_SIDE_MM);
  const { backrestDeg } = peripheral;
  const backrest =
    backrestDeg === undefined
      ? ''
      : fields.number(
          'backrestDeg',
          'Backrest back from upright',
          backrestDeg,
          0,
          MAX_BACKREST_DEG,
          {
            unit: '°',
          },
        );
  return `<h4 class="buy-group">Envelope</h4>${side('widthMm', 'Width', widthMm)}${side('heightMm', 'Height', heightMm)}${side('depthMm', 'Depth', depthMm)}${backrest}<p class="layout-hint">The box it takes, standing on its mounting origin. Resizing it moves neither its holes nor its contact points.</p>`;
}

/** The holes a peripheral is bolted through, a row each, and a button to add one. */
function mountingPatternHTML(holes: readonly Hole[]): string {
  const rows = holes
    .map((hole, index) => {
      const item = String(index);
      const name = `Hole ${index + 1}`;
      const remove = `<button class="text-button" data-remove-hole="${index}" title="Take ${name} out of the pattern"><i data-icon="trash"></i>Remove</button>`;
      const cells = [
        valueCellHTML('holeXMm', item, 'X', `${name}, across`, hole.xMm, MAX_POSITION_MM),
        valueCellHTML(
          'holeYMm',
          item,
          'Y',
          `${name}, towards its front`,
          hole.yMm,
          MAX_POSITION_MM,
        ),
        valueCellHTML(
          'holeDiameterMm',
          item,
          '⌀',
          `${name}, diameter`,
          hole.diameterMm,
          MAX_HOLE_DIAMETER_MM,
          0,
        ),
      ];
      return `<div class="value-row" data-hole-row="${index}"><p class="value-row-name"><span>${name}</span>${remove}</p><div class="value-cells">${cells.join('')}</div></div>`;
    })
    .join('');
  const none =
    holes.length === 0
      ? '<p class="layout-hint">No holes yet: add the ones it is bolted through.</p>'
      : '';
  return `<h4 class="buy-group">Mounting holes</h4><p class="layout-hint">On its underside, in mm from its mounting origin: X across it, Y towards its front.</p>${rows}${none}<button class="text-button" id="addHole"><i data-icon="plus"></i>Add a hole</button>`;
}

/** What the driver meets at each contact point, as the inspector names it. */
const CONTACT_NAMES: Record<ContactRole, string> = {
  hip: 'Hip',
  heel: 'Heels',
  hands: 'Hands',
};

/** Where the driver meets the peripheral, a row each. */
function contactPointsHTML(contactPoints: readonly ContactPoint[]): string {
  if (contactPoints.length === 0) return '';
  const rows = contactPoints
    .map(({ role, offsetMm }) => {
      const name = CONTACT_NAMES[role];
      const cells = [
        valueCellHTML('contactXMm', role, 'X', `${name}, across`, offsetMm.x, MAX_POSITION_MM),
        valueCellHTML('contactYMm', role, 'Y', `${name}, up`, offsetMm.y, MAX_POSITION_MM),
        valueCellHTML(
          'contactZMm',
          role,
          'Z',
          `${name}, towards its front`,
          offsetMm.z,
          MAX_POSITION_MM,
        ),
      ];
      return `<div class="value-row" data-contact-row="${role}"><p class="value-row-name"><span>${name}</span></p><div class="value-cells">${cells.join('')}</div></div>`;
    })
    .join('');
  return `<h4 class="buy-group">Contact points</h4><p class="layout-hint">Where the driver meets it, in mm from its mounting origin: X across, Y up, Z towards its front.</p>${rows}`;
}

/**
 * One value of an item in a list, such as a hole: a short label in a row of them, and the item's
 * name with what the value is for screen readers. `min` is `-max` unless given.
 */
function valueCellHTML(
  field: PartField,
  item: string,
  label: string,
  accessibleName: string,
  valueMm: number,
  max: number,
  min = -max,
): string {
  const id = `part-${field}-${escapeHTML(item)}`;
  return `<label class="value-cell" for="${id}"><span>${label}</span><input id="${id}" type="number" data-part-field="${field}" data-part-item="${escapeHTML(item)}" min="${min}" max="${max}" step="0.5" value="${round(valueMm, 1)}" aria-label="${escapeHTML(accessibleName)}"></label>`;
}

/** The panel of a peripheral about to be mounted, shown in the view as a preview. */
export function peripheralPanelHTML(history: readonly Operation[], draft: MountPeripheral): string {
  const { widthMm, heightMm, depthMm } = draft.envelope;
  const estimated = draft.source.kind === 'estimated' ? ` (${ESTIMATED_PERIPHERAL_HINT})` : '';
  const size = `<p class="layout-hint">${round(widthMm, 1)} × ${round(heightMm, 1)} × ${round(depthMm, 1)} mm, width × height × depth${estimated}. Its own values are set in its inspector once it is mounted.</p>`;
  return `<div class="part-inspector" id="peripheralPanel"><p class="layout-hint">A new ${CATEGORY_NOUNS[draft.category]} on <strong>${escapeHTML(nameOf(history, draft.parentId))}</strong>. Click a face of it in the view, or choose one here.</p>${nameFieldHTML('peripheral', draft.name)}${mountedOnHTML(history, draft)}${size}${peripheralPlaceHTML('peripheral', history, draft)}<div class="grow-actions"><button class="button button-dark" id="confirmPeripheral">Mount it</button><button class="button button-light" id="cancelPeripheral">Cancel</button></div></div>`;
}

/** The panel of a plate about to rest on a profile, shown in the view as a preview. */
export function platePanelHTML(history: readonly Operation[], draft: AddPlate): string {
  return `<div class="part-inspector" id="platePanel"><p class="layout-hint">A new plate on <strong>${escapeHTML(nameOf(history, draft.parentId))}</strong>. Click a face of it in the view, or choose one here.</p>${plateFieldsHTML('plate', history, draft)}<div class="grow-actions"><button class="button button-dark" id="confirmPlate">Add the plate</button><button class="button button-light" id="cancelPlate">Cancel</button></div></div>`;
}

const nameFieldHTML = (prefix: string, name: string): string =>
  `<div class="room-name"><label for="${prefix}-name">Name</label><input id="${prefix}-name" data-part-field="name" value="${escapeHTML(name)}" maxlength="${MAX_PART_NAME_LENGTH}"></div>`;

/** The panel of a profile about to grow out of another, shown in the view as a preview. */
export function growPanelHTML(history: readonly Operation[], draft: GrowProfile): string {
  return `<div class="part-inspector" id="growPanel"><p class="layout-hint">A new profile growing out of <strong>${escapeHTML(parentName(history, draft))}</strong>. Click a face of it in the view, or choose one here.</p>${profileFieldsHTML('grow', history, draft, { reach: true })}<div class="grow-actions"><button class="button button-dark" id="confirmGrowth">Add the profile</button><button class="button button-light" id="cancelGrowth">Cancel</button></div></div>`;
}

/**
 * The fields of a profile's operation; `prefix` keeps the ids of two panels apart. The end of a
 * profile already in the design can reach a part in front of it.
 */
function profileFieldsHTML(
  prefix: string,
  history: readonly Operation[],
  operation: ProfileOperation,
  { reach }: { reach: boolean },
) {
  const fields = new FieldTemplates(prefix);
  const system = profileSystem(operation.systemId);
  const section = profileSection(system, operation.sectionId);
  const sections = system.sections.map((option): [string, string] => [
    option.id,
    sectionName(option.widthMm, option.heightMm),
  ]);
  const lengthAxis = lengthAxisOf(operation);
  const heightAxes = AXES.filter((axis) => axis !== lengthAxis).map((axis): [string, string] => [
    axis,
    AXIS_NAMES[axis],
  ]);
  const name = nameFieldHTML(prefix, operation.name);
  const longSide =
    section.widthMm === section.heightMm
      ? ''
      : fields.select(
          'heightAxis',
          'Long side of the section along',
          heightAxes,
          operation.heightAxis,
        );
  const span = reachOf(history, operation);
  const length =
    fields.number(
      'lengthMm',
      'Length',
      operation.lengthMm,
      MIN_PROFILE_LENGTH_MM,
      MAX_PROFILE_LENGTH_MM,
      { disabled: span !== null },
    ) + spanHintHTML(span);
  const placement =
    operation.kind === 'add-anchored-profile'
      ? anchoredPlacementHTML(fields, operation)
      : grownPlacementHTML(fields, history, operation, reach);
  return `${name}${fields.select('sectionId', 'Section', sections, operation.sectionId)}${placement.before}${longSide}${length}${placement.after}`;
}

function spanHintHTML(span: Reach | null): string {
  if (!span) return '';
  const target = escapeHTML(span.targetName);
  return span.meets
    ? `<p class="layout-hint">Its length is the gap to ${target}; it changes when either part moves.</p>`
    : `<p class="layout-hint part-warning">⚠ Its end no longer meets ${target}: it keeps its last length. Move a part back, or let its end go.</p>`;
}

interface PlacementHTML {
  /** Fields that decide the length axis, shown before the section's long side. */
  before: string;
  after: string;
}

function anchoredPlacementHTML(
  fields: FieldTemplates,
  operation: AddAnchoredProfile,
): PlacementHTML {
  const lengthAxes = AXES.map((axis): [string, string] => [axis, AXIS_NAMES[axis]]);
  const starts = AXES.map((axis) =>
    fields.number(
      START_FIELDS[axis],
      `Start ${axis.toUpperCase()}`,
      operation.startMm[axis],
      -MAX_POSITION_MM,
      MAX_POSITION_MM,
    ),
  ).join('');
  return {
    before: fields.select('axis', 'Runs along', lengthAxes, operation.axis),
    after: `${starts}<p class="layout-hint">The start is the center of the profile's end with the lower coordinate, measured from the cockpit origin. +Y is up, +Z the front, −X the driver's right.</p>`,
  };
}

function grownPlacementHTML(
  fields: FieldTemplates,
  history: readonly Operation[],
  growth: GrowProfile,
  reach: boolean,
): PlacementHTML {
  const parentAxis = profileAxisOf(history, growth.parentId) ?? 'z';
  const faces = FACES.map((face): [string, string] => [
    face,
    faceAxis(face) === parentAxis ? END_FACE_NAMES[face] : SIDE_FACE_NAMES[face],
  ]);
  const parentLine = `<p class="part-parent">Grows out of <strong>${escapeHTML(parentName(history, growth))}</strong></p>`;
  const onAnEnd = faceAxis(growth.face) === parentAxis;
  const ends = (['start', 'end'] as const).map((end): [string, string] => [
    end,
    END_NAMES[parentAxis][end],
  ]);
  const onTheSide = onAnEnd
    ? '<p class="layout-hint">Out of an end face it grows from the center of the end.</p>'
    : `${fields.select('fromEnd', 'Measured from', ends, growth.fromEnd)}${fields.number('alongMm', 'Distance from that end', growth.alongMm, 0, MAX_PROFILE_LENGTH_MM)}${fields.number('acrossMm', 'Offset across the face', growth.acrossMm, -MAX_POSITION_MM, MAX_POSITION_MM)}`;
  const ways: [string, string][] = [
    ['out', 'Out of the face'],
    ...FACES.filter((way) => faceAxis(way) !== faceAxis(growth.face)).map(
      (way): [string, string] => [way, `Along the face, ${DIRECTION_NAMES[way]}`],
    ),
  ];
  return {
    before: `${parentLine}${fields.select('face', 'Face', faces, growth.face)}${fields.select('way', 'Grows', ways, growth.way)}${onTheSide}`,
    after: reach && growth.way === 'out' ? reachSelectHTML(fields, history, growth) : '',
  };
}

/** The end of a profile grown out of a face: free, or reaching a part in front of it. */
function reachSelectHTML(
  fields: FieldTemplates,
  history: readonly Operation[],
  growth: GrowProfile,
): string {
  const name = (partId: string) => escapeHTML(operationMaking(history, partId)?.name ?? partId);
  const facing = facingParts(history, growth.partId);
  const choices: [string, string][] = [
    ['', 'Free, at its own length'],
    ...facing.map((partId): [string, string] => [partId, `Reaches ${name(partId)}`]),
  ];
  const current = growth.reachesId;
  if (current !== undefined && !facing.includes(current))
    choices.push([current, `Reaches ${name(current)} (not meeting it)`]);
  return fields.select('reachesId', 'Its end', choices, current ?? '');
}

/** Labelled controls whose ids start with one prefix. */
class FieldTemplates {
  declare prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  select(
    field: PartField,
    label: string,
    options: readonly [value: string, text: string][],
    value: string,
  ): string {
    const choices = options
      .map(
        ([option, text]) =>
          `<option value="${option}"${option === value ? ' selected' : ''}>${text}</option>`,
      )
      .join('');
    return `<div class="select-control"><label for="${this.prefix}-${field}">${label}</label><select id="${this.prefix}-${field}" data-part-field="${field}">${choices}</select></div>`;
  }

  number(
    field: PartField,
    label: string,
    valueMm: number,
    min: number,
    max: number,
    { disabled = false, unit = 'mm' } = {},
  ): string {
    return `<div class="control"><div class="control-top"><label for="${this.prefix}-${field}">${label}</label><div class="number-wrap"><input id="${this.prefix}-${field}" type="number" data-part-field="${field}" min="${min}" max="${max}" step="1" value="${round(valueMm, 1)}"${disabled ? ' disabled' : ''}><span>${unit}</span></div></div></div>`;
  }
}

/** The inspector field a `data-part-field` names. The markup is the app's, so others are bugs. */
export function partField(value: string | undefined): PartField {
  const field = PART_FIELDS.find((known) => known === value);
  if (!field) throw new Error(`Unknown part field: ${value}`);
  return field;
}

function axisOf(value: string): Axis {
  const axis = AXES.find((known) => known === value);
  if (!axis) throw new Error(`Unknown axis: ${value}`);
  return axis;
}

export function faceOf(value: string): Face {
  const face = FACES.find((known) => known === value);
  if (!face) throw new Error(`Unknown face: ${value}`);
  return face;
}

function endOf(value: string): ParentEnd {
  if (value !== 'start' && value !== 'end') throw new Error(`Unknown end: ${value}`);
  return value;
}

/** A typed number; a blank field is no number, for the design to reject with its reason. */
const typedNumber = (value: string): number => (value.trim() === '' ? Number.NaN : Number(value));

/** The change one field of the inspector makes to the values of the part's operation. */
export function partChange(
  operation: ProfileOperation,
  field: PartField,
  value: string,
): Partial<ProfileValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'sectionId':
      return { sectionId: value };
    case 'axis':
      return { axis: axisOf(value) };
    case 'heightAxis':
      return { heightAxis: axisOf(value) };
    case 'lengthMm':
      return { lengthMm: typedNumber(value) };
    case 'face':
      return { face: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    case 'way':
      return { way: value === 'out' ? 'out' : faceOf(value) };
    case 'reachesId':
      return { reachesId: value === '' ? null : value };
    case 'footTypeId':
    case 'sheetId':
    case 'widthMm':
    case 'depthMm':
    case 'depthAxis':
    case 'facing':
    case 'typeId':
    case 'heightMm':
    case 'backrestDeg':
    case 'holeXMm':
    case 'holeYMm':
    case 'holeDiameterMm':
    case 'contactXMm':
    case 'contactYMm':
    case 'contactZMm':
      throw new Error(`A profile has no ${field}`);
    case 'startX':
    case 'startY':
    case 'startZ':
      return { startMm: changedStart(operation, field, typedNumber(value)) };
  }
}

/** The change one field of a foot's inspector makes to the values of its operation. */
export function footChange(field: PartField, value: string): Partial<FootValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'footTypeId':
      return { footTypeId: value };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    default:
      throw new Error(`A foot has no ${field}`);
  }
}

/**
 * The change one field of a peripheral's inspector makes to the values of its operation. A field
 * of a hole or a contact point names it as `item`: the hole's index, or the contact's role. Its
 * type is swapped rather than changed, as a swap may first need confirming.
 */
export function peripheralChange(
  peripheral: MountPeripheral,
  field: PartField,
  value: string,
  item?: string,
): Partial<PeripheralValues> {
  const { envelope } = peripheral;
  const holeChange = (change: Partial<Hole>) => ({
    mountingPattern: { holes: changedHoles(peripheral, item, change) },
  });
  const contactChange = (axis: Axis) => ({
    contactPoints: changedContacts(peripheral, item, axis, typedNumber(value)),
  });
  switch (field) {
    case 'widthMm':
      return { envelope: { ...envelope, widthMm: typedNumber(value) } };
    case 'heightMm':
      return { envelope: { ...envelope, heightMm: typedNumber(value) } };
    case 'depthMm':
      return { envelope: { ...envelope, depthMm: typedNumber(value) } };
    case 'backrestDeg':
      return { backrestDeg: typedNumber(value) };
    case 'holeXMm':
      return holeChange({ xMm: typedNumber(value) });
    case 'holeYMm':
      return holeChange({ yMm: typedNumber(value) });
    case 'holeDiameterMm':
      return holeChange({ diameterMm: typedNumber(value) });
    case 'contactXMm':
      return contactChange('x');
    case 'contactYMm':
      return contactChange('y');
    case 'contactZMm':
      return contactChange('z');
    case 'typeId':
      throw new Error("A peripheral's type is swapped, not edited: use swapPeripheralType.");
    case 'name':
      return { name: value };
    case 'face':
      return { face: faceOf(value) };
    case 'facing':
      return { facing: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    default:
      throw new Error(`A peripheral has no ${field}`);
  }
}

/** The holes of a peripheral with the one at index `item` changed. */
function changedHoles(
  peripheral: MountPeripheral,
  item: string | undefined,
  change: Partial<Hole>,
): Hole[] {
  const { holes } = peripheral.mountingPattern;
  const index = Number(item);
  if (item === undefined || !Number.isInteger(index) || index < 0 || index >= holes.length)
    throw new Error(`${peripheral.name} has no hole ${index + 1}.`);
  return holes.map((hole, holeIndex) => (holeIndex === index ? { ...hole, ...change } : hole));
}

/** The contact points of a peripheral with the one of role `item` moved along `axis`. */
function changedContacts(
  peripheral: MountPeripheral,
  item: string | undefined,
  axis: Axis,
  valueMm: number,
): ContactPoint[] {
  if (!peripheral.contactPoints.some((contact) => contact.role === item))
    throw new Error(`${peripheral.name} has no ${item} contact point.`);
  return peripheral.contactPoints.map((contact) =>
    contact.role === item
      ? { role: contact.role, offsetMm: { ...contact.offsetMm, [axis]: valueMm } }
      : contact,
  );
}

/** The change one field of a plate's inspector makes to the values of its operation. */
export function plateChange(field: PartField, value: string): Partial<PlateValues> {
  switch (field) {
    case 'name':
      return { name: value };
    case 'sheetId':
      return { sheetId: value };
    case 'widthMm':
      return { widthMm: typedNumber(value) };
    case 'depthMm':
      return { depthMm: typedNumber(value) };
    case 'depthAxis':
      return { depthAxis: axisOf(value) };
    case 'face':
      return { face: faceOf(value) };
    case 'fromEnd':
      return { fromEnd: endOf(value) };
    case 'alongMm':
      return { alongMm: typedNumber(value) };
    case 'acrossMm':
      return { acrossMm: typedNumber(value) };
    default:
      throw new Error(`A plate has no ${field}`);
  }
}

function changedStart(operation: ProfileOperation, field: PartField, valueMm: number): Vec3Mm {
  if (operation.kind !== 'add-anchored-profile')
    throw new Error(`${operation.name} has no start of its own`);
  const axis = AXES.find((candidate) => START_FIELDS[candidate] === field) ?? 'x';
  return { ...operation.startMm, [axis]: valueMm };
}

/**
 * What the Delete key does to the selected step, as its inspector offers it: remove the part it
 * made from the history marker on, or, for a failed step or one that makes no part, delete it.
 * Fitting, the frame is locked; designing, a peripheral is only a reference: both are left alone.
 */
export function deleteKeyAction(
  operation: Operation | undefined,
  failure?: string,
  { fitting = false }: Mode = {},
): 'remove-part' | 'delete-step' | null {
  if (!operation || fitting !== isAPeripheral(operation)) return null;
  return makesAPart(operation) && failure === undefined ? 'remove-part' : 'delete-step';
}
