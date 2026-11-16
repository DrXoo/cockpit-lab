// The cockpit editor's panels: the design history on the left, with the tools that add to it,
// and the inspector of the selected part on the right. The design is shown on its own, in an
// empty workspace without any room. Cockpit files are imported from the actions above the panel.
import { faceAxis, type Axis, type Face, type Vec3Mm } from './cad/assembly.ts';
import { profileSection, profileSystem } from './cad/catalog.ts';
import {
  FACES,
  facingParts,
  lengthAxisOf,
  makesAPart,
  MAX_PART_NAME_LENGTH,
  MAX_POSITION_MM,
  MAX_PROFILE_LENGTH_MM,
  MIN_PROFILE_LENGTH_MM,
  operationMaking,
  replayDesign,
  type AddAnchoredProfile,
  type GrowProfile,
  type MakingOperation,
  type Operation,
  type ParentEnd,
  type ProfileValues,
} from './cad/history.ts';
import { defaults, type RoomConfig } from './config.ts';
import { round } from './geometry.ts';
import { escapeHTML } from './html.ts';

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
}

/** The fields of the inspector, as the markup names them in `data-part-field`. */
export type PartField =
  | 'name'
  | 'sectionId'
  | 'axis'
  | 'heightAxis'
  | 'lengthMm'
  | 'startX'
  | 'startY'
  | 'startZ'
  | 'face'
  | 'fromEnd'
  | 'alongMm'
  | 'acrossMm'
  | 'way'
  | 'reachesId';

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
  const addProfile = `<button class="button button-dark history-add" id="addProfile"><i data-icon="plus"></i>Add a profile</button>`;
  if (panel.history.length === 0)
    return `<div class="control-group" id="emptyDesign"><h3 class="group-title">A design built from parts</h3>${editTools}<p class="layout-hint">A cockpit design is the list of steps that builds it from aluminium profiles, plates and peripherals. New designs start empty: add a profile to start.</p><p class="layout-hint">Cockpits of the earlier configurator are not converted: design them again from parts.</p>${addProfile}</div>`;
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

function stepTitle(history: readonly Operation[], operation: Operation): string {
  return operation.kind === 'remove-part'
    ? `Removes ${nameOf(history, operation.removedId)}`
    : operation.name;
}

function stepDetail(history: readonly Operation[], operation: Operation): string {
  if (operation.kind === 'remove-part') return 'What hangs from it stays where it is, anchored';
  const section = profileSection(profileSystem(operation.systemId), operation.sectionId);
  const made =
    operation.kind === 'add-anchored-profile'
      ? 'Anchored profile'
      : `${operation.way === 'out' ? 'Grown out of' : 'Laid on'} ${escapeHTML(parentName(history, operation))}${reachText(history, operation)}`;
  return `${made} · ${sectionName(section.widthMm, section.heightMm)} · ${round(operation.lengthMm, 1)} mm`;
}

const nameOf = (history: readonly Operation[], partId: string): string =>
  operationMaking(history, partId)?.name ?? 'a deleted part';

const parentName = (history: readonly Operation[], growth: GrowProfile): string =>
  operationMaking(history, growth.parentId)?.name ?? growth.parentId;

/** What a span reaches, and whether its end still meets it. */
interface Reach {
  targetName: string;
  meets: boolean;
}

function reachOf(history: readonly Operation[], operation: MakingOperation): Reach | null {
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
): string {
  if (!operation)
    return `<p class="control-hint" id="noPartSelected">Select a part in the view or in the design history to edit it.</p>`;
  const deleteStep = `<button class="button button-light" id="deleteStep" title="Take this step out of the whole history"><i data-icon="trash"></i>Delete this step</button>`;
  const failed =
    failure === undefined
      ? ''
      : `<p class="layout-hint part-warning">⚠ Failed: ${escapeHTML(failure)} It adds nothing until it applies again.</p>`;
  if (operation.kind === 'remove-part')
    return `<div class="part-inspector" id="partInspectorFields"><p class="layout-hint">Removes <strong>${escapeHTML(nameOf(history, operation.removedId))}</strong> from this step on: the parts that hung from it stay where they are, anchored, and spans that reached it keep their length. Earlier steps still have it.</p>${failed}<div class="grow-actions">${deleteStep}</div></div>`;
  const partActions =
    failure === undefined
      ? `<button class="button button-light" id="growProfile"><i data-icon="plus"></i>Grow a profile out of it</button><button class="button button-light" id="removePart" title="Remove it from the design from the marker on"><i data-icon="close"></i>Remove this part</button>`
      : '';
  return `<div class="part-inspector" id="partInspectorFields">${failed}${profileFieldsHTML('part', history, operation, { reach: failure === undefined })}<div class="part-actions">${partActions}${deleteStep}</div></div>`;
}

/** The panel of a profile about to grow out of another, shown in the view as a preview. */
export function growPanelHTML(history: readonly Operation[], draft: GrowProfile): string {
  return `<div class="part-inspector" id="growPanel"><p class="layout-hint">A new profile growing out of <strong>${escapeHTML(parentName(history, draft))}</strong>. Click a face of it in the view, or choose one here.</p>${profileFieldsHTML('grow', history, draft, { reach: false })}<div class="grow-actions"><button class="button button-dark" id="confirmGrowth">Add the profile</button><button class="button button-light" id="cancelGrowth">Cancel</button></div></div>`;
}

/**
 * The fields of a profile's operation; `prefix` keeps the ids of two panels apart. The end of a
 * profile already in the design can reach a part in front of it.
 */
function profileFieldsHTML(
  prefix: string,
  history: readonly Operation[],
  operation: MakingOperation,
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
  const name = `<div class="room-name"><label for="${prefix}-name">Name</label><input id="${prefix}-name" data-part-field="name" value="${escapeHTML(operation.name)}" maxlength="${MAX_PART_NAME_LENGTH}"></div>`;
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
  const parent = operationMaking(history, growth.parentId);
  const parentAxis = parent ? lengthAxisOf(parent) : 'z';
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
  const ways = [
    ['out', 'Out of the face'] as [string, string],
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
    { disabled = false } = {},
  ): string {
    return `<div class="control"><div class="control-top"><label for="${this.prefix}-${field}">${label}</label><div class="number-wrap"><input id="${this.prefix}-${field}" type="number" data-part-field="${field}" min="${min}" max="${max}" step="1" value="${round(valueMm, 1)}"${disabled ? ' disabled' : ''}><span>mm</span></div></div></div>`;
  }
}

const PART_FIELDS: readonly PartField[] = [
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
];

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

function faceOf(value: string): Face {
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
  operation: MakingOperation,
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
    case 'startX':
    case 'startY':
    case 'startZ':
      return { startMm: changedStart(operation, field, typedNumber(value)) };
  }
}

function changedStart(operation: MakingOperation, field: PartField, valueMm: number): Vec3Mm {
  if (operation.kind !== 'add-anchored-profile')
    throw new Error(`${operation.name} has no start of its own`);
  const axis = AXES.find((candidate) => START_FIELDS[candidate] === field) ?? 'x';
  return { ...operation.startMm, [axis]: valueMm };
}
