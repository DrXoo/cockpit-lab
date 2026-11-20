// The holes a peripheral is bolted through. Each one puts a mounting hole in the plate it is
// mounted on (plate-holes.ts).

/** A hole of a mounting pattern, in mm from the peripheral's mounting origin. */
export interface Hole {
  xMm: number;
  yMm: number;
  diameterMm: number;
}

/** The holes a peripheral is bolted through, relative to its own mounting origin. */
export interface MountingPattern {
  holes: readonly Hole[];
}

/** A side of a mounting pattern, as the driver sees it: its holes towards +X are on the left. */
export type PatternSide = 'left' | 'right';
export const PATTERN_SIDES: readonly PatternSide[] = ['left', 'right'];

/**
 * How far across from the mounting origin the holes of one side are on average, towards +X, as
 * the line along them that rests on a profile; null when that side has no holes.
 */
export function sideLineMm(pattern: MountingPattern, side: PatternSide): number | null {
  const towards = side === 'left' ? 1 : -1;
  const ofSide = pattern.holes.filter((hole) => Math.sign(hole.xMm) === towards);
  if (ofSide.length === 0) return null;
  return ofSide.reduce((sum, hole) => sum + hole.xMm, 0) / ofSide.length;
}
