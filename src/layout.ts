// Placement of the desk in the room.
import type { Placement } from './shared/geometry.ts';
import type { RoomConfig } from './config.ts';

export const deskPose = (s: RoomConfig): Placement => ({
  x: s.deskX,
  z: s.deskZ,
  angle: s.deskAngle,
});
