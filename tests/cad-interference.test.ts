import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly, type Part, type ProfilePart, type Vec3Mm } from '../src/cad/assembly.ts';
import { CAD_CONTACT_MM, cockpitInterferences } from '../src/cad/interference.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const bar = (id: string, startMm: Vec3Mm, changes: Partial<ProfilePart> = {}): ProfilePart => ({
  kind: 'profile',
  id,
  name: `Bar ${id}`,
  systemId: SYSTEM,
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 400,
  placement: { kind: 'anchor', startMm },
  ...changes,
});
const across = (id: string, startMm: Vec3Mm) => bar(id, startMm, { axis: 'x' });

const found = (parts: readonly Part[]) =>
  cockpitInterferences(resolveAssembly(parts)).map(({ partName, otherName, depthMm, axis }) => ({
    partName,
    otherName,
    depthMm: Math.round(depthMm * 1000) / 1000,
    axis,
  }));

test('parts apart or only touching do not interfere', () => {
  assert.deepEqual(found([bar('a', { x: 0, y: 0, z: 0 }), bar('b', { x: 40, y: 0, z: 0 })]), []);
  const withinTolerance = { x: 40 - CAD_CONTACT_MM, y: 0, z: 0 };
  assert.deepEqual(found([bar('a', { x: 0, y: 0, z: 0 }), bar('b', withinTolerance)]), []);
});

test('two crossing profiles interfere by the shortest way out, named by their parts', () => {
  const parts = [bar('a', { x: 0, y: 0, z: 0 }), across('b', { x: -200, y: 30, z: 200 })];
  assert.deepEqual(found(parts), [
    { partName: 'Bar a', otherName: 'Bar b', depthMm: 10, axis: 'y' },
  ]);
});

test('a tilted profile is checked exactly against an upright one, not by its bounding box', () => {
  const tilted = bar(
    'deck',
    { x: 0, y: 100, z: 0 },
    {
      placement: { kind: 'anchor', startMm: { x: 0, y: 100, z: 0 }, tiltDeg: 45 },
    },
  );
  // The tilted bar runs up and forward; a post just below its underside clears it, though it is
  // inside the tilted bar's bounding box.
  const clearPost = bar(
    'clear',
    { x: 0, y: 0, z: 300 },
    { axis: 'y', heightAxis: 'z', lengthMm: 330 },
  );
  assert.deepEqual(found([tilted, clearPost]), []);
  const post = bar('post', { x: 0, y: 0, z: 200 }, { axis: 'y', heightAxis: 'z', lengthMm: 400 });
  const [interference] = found([tilted, post]);
  assert.equal(interference.otherName, 'Bar post');
  assert.ok(interference.depthMm > 0);
});
