import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { drawCadProfiles } from '../src/render-cad.ts';
import { degToRad } from '../src/geometry.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const profile = (id, changes) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 1200,
  placement: { kind: 'anchor', startMm: { x: -280, y: 100, z: 0 } },
  ...changes,
});

const draw = (parts) => {
  const r = createRenderList();
  drawCadProfiles(r, ROOT, resolveAssembly(parts));
  return r.primitives;
};
const bars = (primitives) => primitives.filter((p) => p.kind === 'box' && p.material === 'silver');

test('a profile is drawn as an outlined bar centered on its box, in cm', () => {
  const [bar] = bars(draw([profile('rail')]));
  assert.deepEqual(bar.position, [-28, 10, 60]);
  assert.deepEqual(bar.size, [4, 8, 120]);
  assert.equal(bar.parent, ROOT);
  assert.equal(bar.edges, true);
});

test('an upright 40 × 80 with its wide side across is drawn that way', () => {
  const upright = profile('upright', { axis: 'y', heightAxis: 'x', lengthMm: 500 });
  assert.deepEqual(bars(draw([upright]))[0].size, [8, 50, 4]);
});

test('tilted profiles are drawn in one group turned by their tilt about the origin', () => {
  const tilted = (id, x) =>
    profile(id, {
      sectionId: '40x40',
      lengthMm: 380,
      placement: { kind: 'anchor', startMm: { x, y: 200, z: 500 }, tiltDeg: 15 },
    });
  const primitives = draw([tilted('a', -100), tilted('b', 100)]);
  const groups = primitives.filter((p) => p.kind === 'group');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].position, [0, 0, 0]);
  assert.deepEqual(groups[0].rotation, [-degToRad(15), 0, 0]);
  assert.ok(bars(primitives).every((bar) => bar.parent === groups[0].id));
});

test('feet, plates and peripherals are not drawn as profiles', () => {
  const foot = {
    kind: 'foot',
    id: 'foot',
    name: 'Foot',
    footTypeId: 'leveling-foot',
    placement: { kind: 'attachment', parentId: 'rail', face: '-y', alongMm: 0, fromEnd: 'start' },
  };
  assert.equal(bars(draw([profile('rail'), foot])).length, 1);
});
