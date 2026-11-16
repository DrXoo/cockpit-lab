// The cockpit design: its design history, the ordered list of operations that builds it, in mm
// (docs/adr/0005). A project has at most one, and until the mini CAD is complete no room
// includes it (docs/adr/0004).
import type { Axis, Vec3Mm } from './cad/assembly.ts';
import {
  checkedOperation,
  MAX_PART_NAME_LENGTH,
  type AddAnchoredProfile,
  type Operation,
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
  rejectRepeated(operations.map((operation) => operation.partId));
  return { history: operations };
}

function readOperation(data: unknown): Operation {
  if (!isPlainRecord(data) || data.kind !== 'add-anchored-profile')
    throw new Error('Unknown operation in the design history');
  if (typeof data.name !== 'string') throw new Error('A part name must be text');
  const operation: AddAnchoredProfile = {
    kind: 'add-anchored-profile',
    id: identifier(data.id),
    partId: identifier(data.partId),
    name: cleanUserText(data.name, 'Profile', MAX_PART_NAME_LENGTH),
    systemId: text(data.systemId, 'profile system'),
    sectionId: text(data.sectionId, 'profile section'),
    axis: axis(data.axis),
    heightAxis: axis(data.heightAxis),
    lengthMm: lengthMm(data.lengthMm),
    startMm: pointMm(data.startMm),
  };
  return checkedOperation(operation);
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
