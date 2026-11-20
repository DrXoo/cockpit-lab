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
