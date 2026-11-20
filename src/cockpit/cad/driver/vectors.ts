// Arithmetic on points and directions of the cockpit, in mm.
import type { Vec3Mm } from '../parts/assembly.ts';

export const plus = (a: Vec3Mm, b: Vec3Mm): Vec3Mm => ({
  x: a.x + b.x,
  y: a.y + b.y,
  z: a.z + b.z,
});
export const minus = (a: Vec3Mm, b: Vec3Mm): Vec3Mm => ({
  x: a.x - b.x,
  y: a.y - b.y,
  z: a.z - b.z,
});
export const scaled = (a: Vec3Mm, factor: number): Vec3Mm => ({
  x: a.x * factor,
  y: a.y * factor,
  z: a.z * factor,
});
export const dot = (a: Vec3Mm, b: Vec3Mm): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const norm = (a: Vec3Mm): number => Math.sqrt(dot(a, a));
