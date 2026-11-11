// Approximate seated posture in the cockpit's side plane, from average body proportions.
import { clamp, degToRad } from './geometry.ts';
import type { CockpitConfig } from './config.ts';

/** A point in the cockpit's side (sagittal) plane: Z forward, Y up. */
export interface SidePoint {
  z: number;
  y: number;
}

export const dist = (a: SidePoint, b: SidePoint): number => Math.hypot(a.z - b.z, a.y - b.y);

/** Two-link joint between a and b with link lengths l1 and l2; branch picks the bend side. */
export function solveJoint(a: SidePoint, b: SidePoint, l1: number, l2: number, branch = 1) {
  const d = dist(a, b),
    reachable = d <= l1 + l2 && d >= Math.abs(l1 - l2) && d > 0.001;
  const safeD = clamp(d, Math.abs(l1 - l2) + 0.001, l1 + l2 - 0.001);
  const t = Math.atan2(b.y - a.y, b.z - a.z),
    phi = Math.acos(clamp((l1 * l1 + safeD * safeD - l2 * l2) / (2 * l1 * safeD), -1, 1));
  const joint = {
    z: a.z + l1 * Math.cos(t + branch * phi),
    y: a.y + l1 * Math.sin(t + branch * phi),
  };
  const angle =
    (Math.acos(clamp((l1 * l1 + l2 * l2 - safeD * safeD) / (2 * l1 * l2), -1, 1)) * 180) / Math.PI;
  return { joint, reachable, angle, d };
}
export function anatomy(s: CockpitConfig) {
  const h = s.height,
    a = degToRad(s.recline),
    hip = { z: s.seatZ, y: s.seatH + 4 },
    shoulder = { z: hip.z - Math.sin(a) * h * 0.288, y: hip.y + Math.cos(a) * h * 0.288 };
  const eye = { z: hip.z - Math.sin(a) * h * 0.39, y: hip.y + Math.cos(a) * h * 0.39 };
  const foot = { z: s.pedalZ - 5, y: s.pedalH + 8 };
  const hand = { z: s.wheelZ - 2, y: s.wheelH + 1 };
  const legs = solveJoint(hip, foot, h * 0.245, h * 0.246),
    arms = solveJoint(shoulder, hand, h * 0.186, h * 0.146, -1);
  // Torso to thigh included angle in the sagittal plane.
  const v1 = { z: shoulder.z - hip.z, y: shoulder.y - hip.y },
    v2 = { z: legs.joint.z - hip.z, y: legs.joint.y - hip.y };
  const hipAngle =
    (Math.acos(
      clamp((v1.z * v2.z + v1.y * v2.y) / (Math.hypot(v1.z, v1.y) * Math.hypot(v2.z, v2.y)), -1, 1),
    ) *
      180) /
    Math.PI;
  return { hip, shoulder, eye, foot, hand, legs, arms, hipAngle };
}
