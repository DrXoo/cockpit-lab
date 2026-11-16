// Placement of the desk in the room.
import type { Placement } from './geometry.ts';
import type { CockpitConfig } from './config.ts';

export const deskPose = (s: CockpitConfig): Placement => ({
  x: s.deskX,
  z: s.deskZ,
  angle: s.deskAngle,
});
