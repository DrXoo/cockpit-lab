// Plates and the holes that peripherals mounted on them put there.
// Plate coordinates are in mm on the plate's face, relative to its center.

export interface Hole {
  xMm: number;
  yMm: number;
  diameterMm: number;
}

/** The holes a peripheral is bolted through, relative to its own mounting origin. */
export interface MountingPattern {
  holes: readonly Hole[];
}

export interface Plate {
  widthMm: number;
  depthMm: number;
  thicknessMm: number;
  ownHoles: readonly Hole[];
}

/** A peripheral's mounting pattern with its mounting origin placed on a plate. */
export interface PlateMounting {
  pattern: MountingPattern;
  originXMm: number;
  originYMm: number;
}

/** Every hole of the plate: its own first, then each mounted pattern in order. */
export function plateHoles(plate: Plate, mountings: readonly PlateMounting[]): Hole[] {
  const mountedHoles = mountings.flatMap((mounting) =>
    mounting.pattern.holes.map((hole) => ({
      xMm: hole.xMm + mounting.originXMm,
      yMm: hole.yMm + mounting.originYMm,
      diameterMm: hole.diameterMm,
    })),
  );
  return [...plate.ownHoles, ...mountedHoles];
}
