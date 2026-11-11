// Placement of the desk and the cockpit in the room.
import { round, transformPoint, type Placement } from './geometry.ts';
import type { CockpitConfig } from './config.ts';

export function pose(s: CockpitConfig, target: 'desk' | 'cockpit'): Placement {
  return target === 'desk'
    ? { x: s.deskX, z: s.deskZ, angle: s.deskAngle }
    : { x: s.cockpitX, z: s.cockpitZ, angle: s.cockpitAngle };
}
export function layoutPreset(s: CockpitConfig, name: 'left' | 'front' | 'right'): CockpitConfig {
  const c = pose(s, 'cockpit'),
    offset = s.width / 2 + s.hotasOut + 9 + (s.deskDepth ?? 80) / 2 + 6;
  const local =
      name === 'left'
        ? { x: -offset, z: 95 }
        : name === 'front'
          ? { x: 0, z: s.length + (s.deskDepth ?? 80) / 2 + 6 }
          : { x: offset, z: 95 },
    p = transformPoint(local, c);
  return {
    ...s,
    deskX: round(p.x),
    deskZ: round(p.z),
    deskAngle: (c.angle + (name === 'left' ? 180 : name === 'front' ? 270 : 0)) % 360,
  };
}
