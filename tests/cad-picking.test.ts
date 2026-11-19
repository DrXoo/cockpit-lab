import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { hitAlongRay } from '../src/cad/picking.ts';

const partAlongRay = (resolved, ray) => hitAlongRay(resolved, ray)?.partId ?? null;

const profile = (id, startMm, placement = {}) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: 'motedis-40-i-slot-8',
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 500,
  placement: { kind: 'anchor', startMm, ...placement },
});
const down = (x, z) => ({ originMm: { x, y: 5000, z }, directionMm: { x: 0, y: -1, z: 0 } });

test('a ray picks the part it meets first', () => {
  const lower = profile('lower', { x: 0, y: 20, z: 0 });
  const upper = profile('upper', { x: 0, y: 220, z: 0 });
  const resolved = resolveAssembly([lower, upper]);
  assert.equal(partAlongRay(resolved, down(0, 250)), 'upper');
  const up = { originMm: { x: 0, y: -100, z: 250 }, directionMm: { x: 0, y: 1, z: 0 } };
  assert.equal(partAlongRay(resolved, up), 'lower');
});

test('a ray that misses every part picks nothing', () => {
  const resolved = resolveAssembly([profile('rail', { x: 0, y: 20, z: 0 })]);
  assert.equal(partAlongRay(resolved, down(100, 250)), null);
  assert.equal(partAlongRay(resolved, down(0, 600)), null);
  const away = { originMm: { x: 0, y: 5000, z: 250 }, directionMm: { x: 0, y: 1, z: 0 } };
  assert.equal(partAlongRay(resolved, away), null, 'the part is behind the ray');
});

test('a tilted part is picked where it is drawn, not where its untilted box would be', () => {
  // Tilted 30° about X, the front end of a profile starting at the origin rises to y = 250.
  const tilted = profile('deck', { x: 0, y: 0, z: 0 }, { tiltDeg: 30 });
  const resolved = resolveAssembly([tilted]);
  const sideways = (y, z) => ({ originMm: { x: -1000, y, z }, directionMm: { x: 1, y: 0, z: 0 } });
  assert.equal(partAlongRay(resolved, sideways(240, 425)), 'deck');
  assert.equal(partAlongRay(resolved, sideways(10, 490)), null);
});

test("a hit names the face the ray enters and the point there, in the part's own frame", () => {
  const resolved = resolveAssembly([profile('rail', { x: 0, y: 20, z: 0 })]);
  assert.deepEqual(hitAlongRay(resolved, down(5, 250)), {
    partId: 'rail',
    face: '+y',
    pointMm: { x: 5, y: 40, z: 250 },
  });
  const fromTheBack = { originMm: { x: 0, y: 20, z: -900 }, directionMm: { x: 0, y: 0, z: 2 } };
  assert.equal(hitAlongRay(resolved, fromTheBack).face, '-z');
  const tilted = resolveAssembly([profile('deck', { x: 0, y: 0, z: 0 }, { tiltDeg: 30 })]);
  const sideways = { originMm: { x: -1000, y: 240, z: 425 }, directionMm: { x: 1, y: 0, z: 0 } };
  const hit = hitAlongRay(tilted, sideways);
  assert.equal(hit.face, '-x');
  assert.equal(hit.pointMm.x, -20);
  assert.ok(Math.abs(hit.pointMm.z - 488) < 1, 'measured along the tilted profile');
});
