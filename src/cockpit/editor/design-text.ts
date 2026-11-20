// How the editor names the parts of a design, their axes, faces and ends, and what a step makes,
// in the history and in the inspector alike.
import type { Axis, Face } from '../cad/parts/assembly.ts';
import { connectorType, type PeripheralCategory } from '../cad/parts/catalog.ts';
import {
  isBolts,
  lengthAxisOf,
  makesAProfile,
  operationMaking,
  replayDesign,
  type FastenJoint,
  type GrowProfile,
  type Operation,
  type ParentEnd,
  type ProfileOperation,
} from '../cad/history/history.ts';

export const AXIS_NAMES: Record<Axis, string> = {
  x: 'Across (X)',
  y: 'Up (Y)',
  z: 'Front to back (Z)',
};

/** The faces of a part as the driver sees them: +Y is up, +Z the front, −X the driver's right. */
export const SIDE_FACE_NAMES: Record<Face, string> = {
  '+y': 'Top (+Y)',
  '-y': 'Underside (−Y)',
  '+x': 'Left side (+X)',
  '-x': 'Right side (−X)',
  '+z': 'Front (+Z)',
  '-z': 'Back (−Z)',
};

/** The faces at the ends of a profile, named for the end they close. */
export const END_FACE_NAMES: Record<Face, string> = {
  '+y': 'Top end (+Y)',
  '-y': 'Bottom end (−Y)',
  '+x': 'Left end (+X)',
  '-x': 'Right end (−X)',
  '+z': 'Front end (+Z)',
  '-z': 'Back end (−Z)',
};

/** The ways a profile lying on a face can run, as the driver sees them. */
export const DIRECTION_NAMES: Record<Face, string> = {
  '+x': 'towards the left (+X)',
  '-x': 'towards the right (−X)',
  '+y': 'upwards (+Y)',
  '-y': 'downwards (−Y)',
  '+z': 'towards the front (+Z)',
  '-z': 'towards the back (−Z)',
};

/** The ends of a profile along each axis: its start has the lower coordinate. */
export const END_NAMES: Record<Axis, Record<ParentEnd, string>> = {
  x: { start: 'Right end (−X)', end: 'Left end (+X)' },
  y: { start: 'Bottom end', end: 'Top end' },
  z: { start: 'Back end', end: 'Front end' },
};

/** What each kind of peripheral is called in the history. */
export const CATEGORY_NAMES: Record<PeripheralCategory, string> = {
  seat: 'Seat',
  'wheel-base': 'Wheel base',
  pedals: 'Pedals',
  shifter: 'Shifter',
  handbrake: 'Handbrake',
  'center-stick': 'Center stick',
  'side-stick': 'Side stick',
  throttle: 'Throttle',
};

/** What each kind of peripheral is called in a sentence. */
export const CATEGORY_NOUNS: Record<PeripheralCategory, string> = {
  seat: 'seat',
  'wheel-base': 'wheel base',
  pedals: 'pedal set',
  shifter: 'shifter',
  handbrake: 'handbrake',
  'center-stick': 'center stick',
  'side-stick': 'side stick',
  throttle: 'throttle',
};

export const sectionName = (widthMm: number, heightMm: number) => `${widthMm} × ${heightMm}`;

export const capitalized = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const boltCount = (count: number) => `${count} ${count === 1 ? 'bolt' : 'bolts'}`;

export const nameOf = (history: readonly Operation[], partId: string): string =>
  operationMaking(history, partId)?.name ?? 'a deleted part';

export const parentName = (history: readonly Operation[], growth: GrowProfile): string =>
  operationMaking(history, growth.parentId)?.name ?? growth.parentId;

/** The axis a part's length runs along, when an operation made it as a profile. */
export function profileAxisOf(history: readonly Operation[], partId: string): Axis | null {
  const operation = operationMaking(history, partId);
  return operation && makesAProfile(operation) ? lengthAxisOf(operation) : null;
}

/** What a span reaches, and whether its end still meets it. */
export interface Reach {
  targetName: string;
  meets: boolean;
}

export function reachOf(history: readonly Operation[], operation: ProfileOperation): Reach | null {
  if (operation.kind !== 'grow-profile' || operation.reachesId === undefined) return null;
  const resolved = replayDesign(history).resolved.get(operation.partId);
  return {
    targetName: operationMaking(history, operation.reachesId)?.name ?? operation.reachesId,
    meets: resolved !== undefined && !resolved.openEnd,
  };
}

/**
 * How many connectors of each type a fastening puts on its joint, such as "2 × 40 corner
 * bracket", or how many bolts go in each slot of a plate's.
 */
export function connectorCountText(fastening: FastenJoint): string {
  const bolts = fastening.connectors.find(isBolts);
  if (bolts) return `${boltCount(bolts.perSlot)} in each slot`;
  const counts = new Map<string, number>();
  for (const { typeId } of fastening.connectors) counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  return [...counts]
    .map(([typeId, count]) => `${count} × ${connectorType(typeId).name}`)
    .join(', ');
}
