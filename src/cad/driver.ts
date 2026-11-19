// The driver a cockpit design is made for (CONTEXT.md: Driver). Only the stature is stored: the
// posture follows from where the design puts the seat, the wheel and the pedals. Lengths in mm.

export interface Driver {
  statureMm: number;
}

/** A driver of average stature, as the plan sets it for a new design. */
export const DEFAULT_DRIVER: Driver = { statureMm: 1750 };

/** The adult statures the average proportions of the posture model are used for. */
export const MIN_STATURE_MM = 1400;
export const MAX_STATURE_MM = 2100;

/** The driver with this stature; throws a user-facing message outside the statures it takes. */
export function driverOfStature(statureMm: number): Driver {
  if (!Number.isFinite(statureMm) || statureMm < MIN_STATURE_MM || statureMm > MAX_STATURE_MM)
    throw new Error(
      `A driver's stature is from ${MIN_STATURE_MM / 10} to ${MAX_STATURE_MM / 10} cm.`,
    );
  return { statureMm };
}
