// The cockpit design: its design history, the ordered list of operations that builds it, in mm
// (docs/adr/0005), and the driver it is made for. A project has at most one, and until the mini CAD is complete no room
// includes it (docs/adr/0004).
import {
  CONTACT_ROLES,
  HANDS,
  type Axis,
  type ContactPoint,
  type ContactRole,
  type Envelope,
  type Face,
  type Hand,
  type Vec3Mm,
} from './cad/parts/assembly.ts';
import {
  DATA_SOURCE_KINDS,
  PERIPHERAL_CATEGORIES,
  type DataSource,
  type PeripheralCategory,
} from './cad/parts/catalog.ts';
import { DEFAULT_PROCESS_ID } from './cad/parts/fabrication.ts';
import {
  PATTERN_SIDES,
  type Hole,
  type MountingPattern,
  type PatternSide,
} from './cad/parts/mounting-pattern.ts';
import {
  ADJUSTMENT_GUIDES,
  checkedHistory,
  checkedOperation,
  FACES,
  makesAPart,
  MAX_PART_NAME_LENGTH,
  type Adjustment,
  type AdjustmentGuide,
  type ConnectorChoice,
  type Operation,
  type ParentEnd,
} from './cad/history/history.ts';
import { DEFAULT_DRIVER, driverOfStature, type Driver } from './cad/driver/driver.ts';
import { jointIdOf } from './cad/parts/joints.ts';
import type { Subassembly } from './cad/history/subassemblies.ts';
import type { Mode } from './cad/history/modes.ts';
import { checkedModePositions } from './cad/history/mode-positions.ts';
import { cleanUserText } from '../shared/user-text.ts';

export type { Operation } from './cad/history/history.ts';

export interface CockpitDesign {
  history: readonly Operation[];
  driver: Driver;
  /** The parts taken off and put back as a whole, beside the history (docs/adr/0007); none when left out. */
  subassemblies?: readonly Subassembly[];
  /** The ways the cockpit is used, each with the subassemblies it takes off; none when left out. */
  modes?: readonly Mode[];
  /** The mode the view shows and checks; all the parts when left out. */
  shownModeId?: string;
}

/** A cockpit design as project and cockpit files store it, with its units. */
export interface CockpitDesignData {
  units: 'mm';
  history: readonly Operation[];
  driver: Driver;
  subassemblies?: readonly Subassembly[];
  modes?: readonly Mode[];
  shownModeId?: string;
}

/** A new design starts empty. */
export const emptyDesign = (): CockpitDesign => ({ history: [], driver: DEFAULT_DRIVER });

/** A design without subassemblies or modes is stored as it was before they existed. */
export const designData = (design: CockpitDesign): CockpitDesignData => ({
  units: 'mm',
  history: design.history,
  driver: design.driver,
  ...(design.subassemblies?.length ? { subassemblies: design.subassemblies } : {}),
  ...(design.modes?.length ? { modes: design.modes } : {}),
  ...(design.modes?.length && design.shownModeId !== undefined
    ? { shownModeId: design.shownModeId }
    : {}),
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The design a file stores. Throws a user-facing message when it can't be used: every
 * operation must be one this version knows, with values it can have.
 */
export function readDesign(data: unknown): CockpitDesign {
  if (!isPlainRecord(data)) throw new Error('Invalid cockpit design');
  if (data.units !== 'mm') throw new Error('Unsupported cockpit design units');
  const { history } = data;
  if (!Array.isArray(history)) throw new Error('Invalid design history');
  const operations = history.map(readOperation);
  rejectRepeated(operations.map((operation) => operation.id));
  rejectRepeated(operations.filter(makesAPart).map((operation) => operation.partId));
  rejectJointsFastenedTwice(operations);
  const driver = data.driver === undefined ? DEFAULT_DRIVER : readDriver(data.driver);
  const design: CockpitDesign = { history: checkedHistory(operations), driver };
  const subassemblies =
    data.subassemblies === undefined ? undefined : readSubassemblies(data.subassemblies);
  if (subassemblies) design.subassemblies = subassemblies;
  if (data.modes === undefined) return design;
  const modes = checkedModePositions(design.history, readModes(data.modes, subassemblies ?? []));
  return { ...design, modes, ...readShownMode(data.shownModeId, modes) };
}

/** A design's modes, each id once, taking off only subassemblies the design has. */
function readModes(data: unknown, subassemblies: readonly Subassembly[]): Mode[] {
  if (!Array.isArray(data)) throw new Error('Invalid modes in the cockpit design');
  const roots = new Set(subassemblies.map(({ rootId }) => rootId));
  const modes = data.map((value): Mode => {
    const stored = recordOf(value, 'mode', ['id', 'name', 'takenOff', 'positionsMm']);
    if (typeof stored.name !== 'string') throw new Error("A mode's name must be text");
    const { takenOff } = stored;
    if (!Array.isArray(takenOff))
      throw new Error('A mode needs the list of the subassemblies it takes off');
    const name = cleanUserText(stored.name, 'Mode', MAX_PART_NAME_LENGTH);
    const mode: Mode = { id: identifier(stored.id), name, takenOff: takenOff.map(subassemblyRoot) };
    return stored.positionsMm === undefined
      ? mode
      : { ...mode, positionsMm: readPositions(stored.positionsMm) };
  });
  const ids = modes.map(({ id }) => id);
  const repeated = ids.find((id, index) => ids.indexOf(id) !== index);
  if (repeated !== undefined) throw new Error(`Two modes have the same identifier, ${repeated}`);
  return modes;

  function subassemblyRoot(value: unknown): string {
    const rootId = identifier(value);
    if (!roots.has(rootId))
      throw new Error(`A mode takes off ${rootId}, which roots no subassembly`);
    return rootId;
  }
}

/** Where a mode puts each adjustment, in mm by the id of its part. */
function readPositions(value: unknown): Record<string, number> {
  if (!isPlainRecord(value)) throw new Error('Invalid positions of a mode');
  const positions: Record<string, number> = {};
  for (const [partId, positionMm] of Object.entries(value))
    positions[partId] = millimetres(positionMm, 'position along a travel');
  return positions;
}

/** The mode shown, one of the design's; all the parts are shown when it names none. */
function readShownMode(value: unknown, modes: readonly Mode[]): { shownModeId?: string } {
  if (value === undefined) return {};
  const id = identifier(value);
  if (!modes.some((mode) => mode.id === id))
    throw new Error(`The cockpit design shows the mode ${id}, which it does not have`);
  return { shownModeId: id };
}

/**
 * A design's subassemblies, each root once. A root the history no longer makes is kept: the
 * subassembly does not apply until a step makes it again, as when its step's deletion is undone.
 */
function readSubassemblies(data: unknown): Subassembly[] {
  if (!Array.isArray(data)) throw new Error('Invalid subassemblies in the cockpit design');
  const subassemblies = data.map((value): Subassembly => {
    const stored = recordOf(value, 'subassembly', ['name', 'rootId']);
    if (typeof stored.name !== 'string') throw new Error("A subassembly's name must be text");
    return {
      name: cleanUserText(stored.name, 'Subassembly', MAX_PART_NAME_LENGTH),
      rootId: identifier(stored.rootId),
    };
  });
  const roots = subassemblies.map(({ rootId }) => rootId);
  const repeated = roots.find((rootId, index) => roots.indexOf(rootId) !== index);
  if (repeated !== undefined) throw new Error(`Two subassemblies have the same root, ${repeated}`);
  return subassemblies;
}

/** A design saved before it had a driver opens with the default one. */
function readDriver(data: unknown): Driver {
  if (!isPlainRecord(data)) throw new Error('Invalid driver in the cockpit design');
  const unknown = Object.keys(data).find((key) => key !== 'statureMm');
  if (unknown) throw new Error(`A driver has no ${unknown}`);
  if (typeof data.statureMm !== 'number')
    throw new Error("A driver's stature must be a number of mm.");
  return driverOfStature(data.statureMm);
}

function readOperation(data: unknown): Operation {
  if (!isPlainRecord(data)) throw new Error('Unknown operation in the design history');
  if (data.kind === 'add-anchored-profile') return checkedOperation(readAnchored(data));
  if (data.kind === 'grow-profile') return checkedOperation(readGrowth(data));
  if (data.kind === 'remove-part') return checkedOperation(readRemoval(data));
  if (data.kind === 'add-foot') return checkedOperation(readFoot(data));
  if (data.kind === 'add-plate') return checkedOperation(readPlate(data));
  if (data.kind === 'mount-peripheral') return checkedOperation(readMounting(data));
  if (data.kind === 'fasten-joint') return checkedOperation(readFastening(data));
  if (data.kind === 'join-parts') return checkedOperation(readJoin(data));
  throw new Error('Unknown operation in the design history');
}

/** The values every profile operation stores. */
function readShape(data: Record<string, unknown>) {
  if (typeof data.name !== 'string') throw new Error('A part name must be text');
  return {
    id: identifier(data.id),
    partId: identifier(data.partId),
    name: cleanUserText(data.name, 'Profile', MAX_PART_NAME_LENGTH),
    systemId: text(data.systemId, 'profile system'),
    sectionId: text(data.sectionId, 'profile section'),
    heightAxis: axis(data.heightAxis),
    lengthMm: lengthMm(data.lengthMm),
  };
}

const SHAPE_KEYS = [
  'kind',
  'id',
  'partId',
  'name',
  'systemId',
  'sectionId',
  'heightAxis',
  'lengthMm',
];

function readAnchored(data: Record<string, unknown>): Operation {
  onlyKeys(data, [...SHAPE_KEYS, 'axis', 'startMm']);
  return {
    kind: 'add-anchored-profile',
    ...readShape(data),
    axis: axis(data.axis),
    startMm: pointMm(data.startMm),
  };
}

function readRemoval(data: Record<string, unknown>): Operation {
  onlyKeys(data, ['kind', 'id', 'removedId']);
  return { kind: 'remove-part', id: identifier(data.id), removedId: identifier(data.removedId) };
}

function readJoin(data: Record<string, unknown>): Operation {
  onlyKeys(data, ['kind', 'id', 'partId', 'toPartId']);
  return {
    kind: 'join-parts',
    id: identifier(data.id),
    partId: identifier(data.partId),
    toPartId: identifier(data.toPartId),
  };
}

function readFastening(data: Record<string, unknown>): Operation {
  onlyKeys(data, ['kind', 'id', 'partId', 'toPartId', 'connectors']);
  if (!Array.isArray(data.connectors)) throw new Error('A fastening needs its connectors');
  return {
    kind: 'fasten-joint',
    id: identifier(data.id),
    partId: identifier(data.partId),
    toPartId: identifier(data.toPartId),
    connectors: data.connectors.map(readConnector),
  };
}

/** Corner brackets name the side they sit on; a plate's bolts, how many go in each slot. */
function readConnector(data: unknown): ConnectorChoice {
  if (!isPlainRecord(data)) throw new Error('Invalid connector');
  const keys = 'perSlot' in data ? ['typeId', 'perSlot'] : ['typeId', 'side'];
  const unknown = Object.keys(data).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`A connector has no ${unknown}`);
  const typeId = text(data.typeId, 'connector type');
  if (!('perSlot' in data)) return { typeId, side: face(data.side) };
  if (typeof data.perSlot !== 'number') throw new Error('The bolts in each slot must be a number');
  return { typeId, perSlot: data.perSlot };
}

/** Each joint has one fastening step, which holds all its connectors. */
function rejectJointsFastenedTwice(operations: readonly Operation[]): void {
  const fastened = new Set<string>();
  for (const operation of operations) {
    if (operation.kind !== 'fasten-joint') continue;
    const joint = jointIdOf(operation);
    if (fastened.has(joint)) throw new Error(`The design history fastens the joint ${joint} twice`);
    fastened.add(joint);
  }
}

function readFoot(data: Record<string, unknown>): Operation {
  onlyKeys(data, ['kind', 'id', 'partId', 'name', 'footTypeId', 'parentId', 'fromEnd', 'alongMm']);
  if (typeof data.name !== 'string') throw new Error('A part name must be text');
  return {
    kind: 'add-foot',
    id: identifier(data.id),
    partId: identifier(data.partId),
    name: cleanUserText(data.name, 'Foot', MAX_PART_NAME_LENGTH),
    footTypeId: text(data.footTypeId, 'foot type'),
    parentId: identifier(data.parentId),
    fromEnd: parentEnd(data.fromEnd),
    alongMm: millimetres(data.alongMm, 'distance along a part'),
  };
}

function readPlate(data: Record<string, unknown>): Operation {
  onlyKeys(data, [
    'kind',
    'id',
    'partId',
    'name',
    'sheetId',
    'processId',
    'widthMm',
    'depthMm',
    'depthAxis',
    'parentId',
    'face',
    'fromEnd',
    'alongMm',
    'acrossMm',
    'adjustment',
  ]);
  if (typeof data.name !== 'string') throw new Error('A part name must be text');
  return {
    kind: 'add-plate',
    id: identifier(data.id),
    partId: identifier(data.partId),
    name: cleanUserText(data.name, 'Plate', MAX_PART_NAME_LENGTH),
    sheetId: text(data.sheetId, 'sheet'),
    // A plate saved before it had a process is laser cut, as a new one is.
    processId: data.processId === undefined ? DEFAULT_PROCESS_ID : text(data.processId, 'process'),
    widthMm: millimetres(data.widthMm, 'plate width'),
    depthMm: millimetres(data.depthMm, 'plate depth'),
    depthAxis: axis(data.depthAxis),
    parentId: identifier(data.parentId),
    face: face(data.face),
    fromEnd: parentEnd(data.fromEnd),
    alongMm: millimetres(data.alongMm, 'distance along a part'),
    acrossMm: millimetres(data.acrossMm, 'offset across a face'),
    ...optionalAdjustment(data.adjustment),
  };
}

/**
 * A mounted peripheral holds the values its type had when it was mounted. Its type and
 * category are checked by the operation itself: a type no longer in the catalog still opens.
 */
function readMounting(data: Record<string, unknown>): Operation {
  onlyKeys(data, [
    'kind',
    'id',
    'partId',
    'name',
    'typeId',
    'category',
    'envelope',
    'mountingPattern',
    'contactPoints',
    'backrestDeg',
    'source',
    'parentId',
    'face',
    'fromEnd',
    'alongMm',
    'acrossMm',
    'facing',
    'hand',
    'holesOver',
    'betweenId',
    'adjustment',
  ]);
  if (typeof data.name !== 'string') throw new Error('A part name must be text');
  if (!Array.isArray(data.contactPoints)) throw new Error('A peripheral needs its contact points');
  return {
    kind: 'mount-peripheral',
    id: identifier(data.id),
    partId: identifier(data.partId),
    name: cleanUserText(data.name, 'Peripheral', MAX_PART_NAME_LENGTH),
    typeId: text(data.typeId, 'peripheral type'),
    category: peripheralCategory(data.category),
    envelope: readEnvelope(data.envelope),
    mountingPattern: readMountingPattern(data.mountingPattern),
    contactPoints: data.contactPoints.map(readContactPoint),
    ...(data.backrestDeg === undefined
      ? {}
      : { backrestDeg: number(data.backrestDeg, 'backrest angle') }),
    source: readSource(data.source),
    parentId: identifier(data.parentId),
    face: face(data.face),
    fromEnd: parentEnd(data.fromEnd),
    alongMm: millimetres(data.alongMm, 'distance along a part'),
    acrossMm: millimetres(data.acrossMm, 'offset across a face'),
    facing: face(data.facing),
    ...(data.hand === undefined ? {} : { hand: hand(data.hand) }),
    ...(data.holesOver === undefined ? {} : { holesOver: patternSide(data.holesOver) }),
    ...(data.betweenId === undefined ? {} : { betweenId: identifier(data.betweenId) }),
    ...peripheralAdjustment(data.adjustment),
  };
}

/** An adjustment, stored only on a part that has one; its operation checks its values. */
function optionalAdjustment(value: unknown): { adjustment?: Adjustment } {
  if (value === undefined) return {};
  const data = recordOf(value, 'adjustment', ['axis', 'travelMm', 'positionMm', 'runsOn']);
  return {
    adjustment: {
      axis: axis(data.axis),
      travelMm: millimetres(data.travelMm, 'travel'),
      positionMm: millimetres(data.positionMm, 'position along a travel'),
      ...(data.runsOn === undefined ? {} : { runsOn: adjustmentGuide(data.runsOn) }),
    },
  };
}

/** A peripheral's adjustment, on its rails when saved before it said what it runs on. */
function peripheralAdjustment(value: unknown): { adjustment?: Adjustment } {
  const { adjustment } = optionalAdjustment(value);
  if (adjustment === undefined) return {};
  return { adjustment: { ...adjustment, runsOn: adjustment.runsOn ?? 'rails' } };
}

function adjustmentGuide(value: unknown): AdjustmentGuide {
  const guide = ADJUSTMENT_GUIDES.find((known) => known === value);
  if (!guide) throw new Error(`An adjustment runs on rails or in slots, not ${String(value)}.`);
  return guide;
}

function readEnvelope(value: unknown): Envelope {
  const data = recordOf(value, 'envelope', ['widthMm', 'heightMm', 'depthMm']);
  return {
    widthMm: millimetres(data.widthMm, 'peripheral width'),
    heightMm: millimetres(data.heightMm, 'peripheral height'),
    depthMm: millimetres(data.depthMm, 'peripheral depth'),
  };
}

function readMountingPattern(value: unknown): MountingPattern {
  const data = recordOf(value, 'mounting pattern', ['holes']);
  if (!Array.isArray(data.holes)) throw new Error('A mounting pattern needs its holes');
  return { holes: data.holes.map(readHole) };
}

function readHole(value: unknown): Hole {
  const data = recordOf(value, 'hole', ['xMm', 'yMm', 'diameterMm']);
  return {
    xMm: millimetres(data.xMm, 'hole position'),
    yMm: millimetres(data.yMm, 'hole position'),
    diameterMm: millimetres(data.diameterMm, 'hole diameter'),
  };
}

function readContactPoint(value: unknown): ContactPoint {
  const data = recordOf(value, 'contact point', ['role', 'offsetMm']);
  return { role: contactRole(data.role), offsetMm: pointMm(data.offsetMm) };
}

function readSource(value: unknown): DataSource {
  const data = recordOf(value, 'source', ['kind', 'reference']);
  return { kind: sourceKind(data.kind), reference: text(data.reference, 'source') };
}

function peripheralCategory(value: unknown): PeripheralCategory {
  const known = PERIPHERAL_CATEGORIES.find((candidate) => candidate === value);
  if (!known) throw new Error(`Unknown kind of peripheral: ${value}`);
  return known;
}

function contactRole(value: unknown): ContactRole {
  const known = CONTACT_ROLES.find((candidate) => candidate === value);
  if (!known) throw new Error(`Unknown contact point: ${value}`);
  return known;
}

function patternSide(value: unknown): PatternSide {
  const known = PATTERN_SIDES.find((side) => side === value);
  if (!known) throw new Error(`Unknown side of a mounting pattern: ${value}`);
  return known;
}

function hand(value: unknown): Hand {
  const known = HANDS.find((candidate) => candidate === value);
  if (!known)
    throw new Error(`A grip is used by the left or the right hand: which hand is ${value}?`);
  return known;
}

function sourceKind(value: unknown): DataSource['kind'] {
  const known = DATA_SOURCE_KINDS.find((candidate) => candidate === value);
  if (!known) throw new Error(`Unknown kind of source: ${value}`);
  return known;
}

/** A stored record holding the values named and nothing else. */
function recordOf(value: unknown, what: string, keys: readonly string[]): Record<string, unknown> {
  if (!isPlainRecord(value)) throw new Error(`Invalid ${what}`);
  const unknown = Object.keys(value).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`A ${what} has no ${unknown}`);
  return value;
}

function number(value: unknown, what: string): number {
  if (typeof value !== 'number') throw new Error(`A ${what} must be a number`);
  return value;
}

function readGrowth(data: Record<string, unknown>): Operation {
  onlyKeys(data, [
    ...SHAPE_KEYS,
    'parentId',
    'face',
    'fromEnd',
    'alongMm',
    'acrossMm',
    'way',
    'reachesId',
    'adjustment',
  ]);
  return {
    kind: 'grow-profile',
    ...readShape(data),
    parentId: identifier(data.parentId),
    face: face(data.face),
    fromEnd: parentEnd(data.fromEnd),
    alongMm: millimetres(data.alongMm, 'distance along a part'),
    acrossMm: millimetres(data.acrossMm, 'offset across a face'),
    way: data.way === 'out' ? 'out' : wayAlongAFace(data.way),
    ...(data.reachesId === undefined ? {} : { reachesId: identifier(data.reachesId) }),
    ...optionalAdjustment(data.adjustment),
  };
}

/** A stored operation holds the values of its kind and nothing else. */
function onlyKeys(data: Record<string, unknown>, keys: readonly string[]) {
  const unknown = Object.keys(data).find((key) => !keys.includes(key));
  if (unknown) throw new Error(`An operation of kind ${data.kind} has no ${unknown}`);
}

function face(value: unknown): Face {
  const known = FACES.find((candidate) => candidate === value);
  if (!known) throw new Error(`Unknown face: ${value}`);
  return known;
}

function wayAlongAFace(value: unknown): Face {
  const known = FACES.find((candidate) => candidate === value);
  if (!known) throw new Error(`Unknown way to grow: ${value}`);
  return known;
}

function parentEnd(value: unknown): ParentEnd {
  if (value !== 'start' && value !== 'end') throw new Error(`Unknown end: ${value}`);
  return value;
}

function millimetres(value: unknown, what: string): number {
  if (typeof value !== 'number') throw new Error(`A ${what} must be a number`);
  return value;
}

function identifier(value: unknown): string {
  if (typeof value !== 'string' || value === '')
    throw new Error('An operation needs an identifier');
  return value;
}

function text(value: unknown, what: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid ${what}`);
  return value;
}

function axis(value: unknown): Axis {
  if (value !== 'x' && value !== 'y' && value !== 'z') throw new Error(`Unknown axis: ${value}`);
  return value;
}

function lengthMm(value: unknown): number {
  if (typeof value !== 'number') throw new Error('A profile length must be a number');
  return value;
}

function pointMm(value: unknown): Vec3Mm {
  if (!isPlainRecord(value)) throw new Error('Invalid position');
  const { x, y, z } = value;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number')
    throw new Error('A position needs X, Y and Z in mm');
  return { x, y, z };
}

function rejectRepeated(ids: readonly string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new Error(`The design history repeats the identifier ${id}`);
    seen.add(id);
  }
}
