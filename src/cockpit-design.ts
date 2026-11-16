// The cockpit design: its design history, the ordered list of operations that builds it, in mm
// (docs/adr/0005). A project has at most one, and until the mini CAD is complete no room
// includes it (docs/adr/0004).
import type { Axis, Face, Vec3Mm } from './cad/assembly.ts';
import {
  checkedHistory,
  checkedOperation,
  FACES,
  makesAPart,
  MAX_PART_NAME_LENGTH,
  type Operation,
  type ParentEnd,
} from './cad/history.ts';
import { cleanUserText } from './user-text.ts';

export type { Operation } from './cad/history.ts';

export interface CockpitDesign {
  history: readonly Operation[];
}

/** A cockpit design as project and cockpit files store it, with its units. */
export interface CockpitDesignData {
  units: 'mm';
  history: readonly Operation[];
}

/** A new design starts empty. */
export const emptyDesign = (): CockpitDesign => ({ history: [] });

export const designData = (design: CockpitDesign): CockpitDesignData => ({
  units: 'mm',
  history: design.history,
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
  return { history: checkedHistory(operations) };
}

function readOperation(data: unknown): Operation {
  if (!isPlainRecord(data)) throw new Error('Unknown operation in the design history');
  if (data.kind === 'add-anchored-profile') return checkedOperation(readAnchored(data));
  if (data.kind === 'grow-profile') return checkedOperation(readGrowth(data));
  if (data.kind === 'remove-part') return checkedOperation(readRemoval(data));
  if (data.kind === 'add-foot') return checkedOperation(readFoot(data));
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
