// The cockpit rig: heights relative to its base, base extensions and the driving controls mount.
import type { CockpitConfig } from './config.ts';
import { degToRad } from './geometry.ts';

// Rig heights are stored relative to the original cockpit base; the UI shows heights from the floor.
export const rigHeightKeys = ['seatH', 'wheelH', 'pedalH', 'hotasH', 'stickH'] as const;
export type RigHeightKey = (typeof rigHeightKeys)[number];
export const isRigHeightKey = (key: string): key is RigHeightKey =>
  (rigHeightKeys as readonly string[]).includes(key);

export const rigLift = (s: Partial<Pick<CockpitConfig, 'baseLift'>>): number => s.baseLift ?? 0;
export const floorHeight = (s: CockpitConfig, key: RigHeightKey): number => s[key] + rigLift(s);
export function setRigHeight(s: CockpitConfig, key: RigHeightKey, value: number): CockpitConfig {
  return { ...s, [key]: value - rigLift(s) };
}
// Four extensions between the original feet (Y = 6) and the underside of the chassis.
// The parts are defined here and feed the scene, the envelopes and the cut list.
export interface BaseSupport {
  x: number;
  y: number;
  z: number;
  length: number;
  profile: string;
}

export function baseSupports(s: CockpitConfig): BaseSupport[] {
  const length = rigLift(s);
  if (s.cockpitEnabled === false || length <= 0) return [];
  return [-s.width / 2 + 2, s.width / 2 - 2].flatMap((x) =>
    [10, s.length - 10].map((z) => ({ x, z, y: 6 + length / 2, length, profile: '40 × 40' })),
  );
}

/** How far back the reclined seat reaches, in cm along Z. */
export const seatBackOf = (s: Pick<CockpitConfig, 'seatZ' | 'recline'>): number =>
  s.seatZ - 12 - Math.sin(degToRad(s.recline)) * 64 - Math.cos(degToRad(s.recline)) * 4.5;

// Forward is +Z and up is +Y: the seated driver's right is -X.
export function drivingMount(
  s: Pick<CockpitConfig, 'drivingSide' | 'width' | 'hotasOut' | 'hotasZ'>,
) {
  const sign = s.drivingSide === 'left' ? 1 : -1;
  return { sign, x: sign * (s.width / 2 + s.hotasOut), z: s.hotasZ - 7 };
}
