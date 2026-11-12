// Measures interference between volumes: whether two volumes overlap beyond the contact
// tolerances and, if they do, how far one must move to clear the other.
import { overlapDepth, penetrationDepth, type Solid } from './geometry.ts';

/** Overlaps up to these widths, in cm, are contact rather than interference. */
export interface ContactTolerance {
  heightCm: number;
  planCm: number;
}

/** The shortest way out of an overlap: up or down, or sideways in the plan. */
export interface Overlap {
  depthCm: number;
  axis: 'vertical' | 'plan';
}

/** Null when the volumes are apart or only in contact. */
export function solidOverlap(a: Solid, b: Solid, tolerance: ContactTolerance): Overlap | null {
  const sharedHeightCm = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  if (sharedHeightCm <= tolerance.heightCm) return null;
  if (overlapDepth(a.polygon, b.polygon) <= tolerance.planCm) return null;
  const verticalCm = Math.min(a.y1 - b.y0, b.y1 - a.y0);
  const planCm = penetrationDepth(a.polygon, b.polygon);
  return verticalCm <= planCm
    ? { depthCm: verticalCm, axis: 'vertical' }
    : { depthCm: planCm, axis: 'plan' };
}

export interface NamedSolid extends Solid {
  label: string;
}

/** A named part reaching into a named item, and the shortest way out. */
export interface Interference extends Overlap {
  part: string;
  item: string;
}

/**
 * Every pair of a part and an item that interfere. Volumes sharing a name (the two columns of a
 * desk) count as one, with their deepest overlap. Deepest first.
 */
export function findInterferences(
  parts: readonly NamedSolid[],
  items: readonly NamedSolid[],
  tolerance: ContactTolerance,
): Interference[] {
  const deepest = new Map<string, Interference>();
  for (const part of parts)
    for (const item of items) {
      const overlap = solidOverlap(part, item, tolerance);
      if (!overlap) continue;
      const key = JSON.stringify([part.label, item.label]);
      const known = deepest.get(key);
      if (!known || overlap.depthCm > known.depthCm)
        deepest.set(key, { part: part.label, item: item.label, ...overlap });
    }
  return [...deepest.values()].sort((a, b) => b.depthCm - a.depthCm);
}

const AXIS_TEXT: Record<Overlap['axis'], string> = {
  vertical: 'vertically',
  plan: 'in the plan',
};

/** Floating point noise below this, in mm, does not round a depth up to the next mm. */
const ROUNDING_SLACK_MM = 1e-6;

/** Rounded up to the mm, so a small overlap never reads as 0 cm. */
const depthText = (depthCm: number): string =>
  `${Math.ceil(depthCm * 10 - ROUNDING_SLACK_MM) / 10} cm`;

export const describeInterference = (interference: Interference): string =>
  `${interference.part} into ${interference.item}: ${depthText(interference.depthCm)} ${AXIS_TEXT[interference.axis]}`;
