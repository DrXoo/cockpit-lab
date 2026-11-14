import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { jointsOf } from '../src/cad/joints.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const rail = (id, xMm, lengthMm = 1200) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm,
  placement: { kind: 'anchor', startMm: { x: xMm, y: 100, z: 0 } },
});
const crossmember = {
  ...rail('rear', 0),
  axis: 'x',
  lengthMm: 0,
  placement: {
    kind: 'span',
    parentId: 'left-rail',
    face: '+x',
    alongMm: 100,
    fromEnd: 'start',
    reachesId: 'right-rail',
  },
};
const post = {
  ...rail('post', 0, 300),
  sectionId: '40x40',
  axis: 'y',
  heightAxis: 'z',
  placement: { kind: 'attachment', parentId: 'rear', face: '+y', alongMm: 60, fromEnd: 'start' },
};
const foot = {
  kind: 'foot',
  id: 'foot',
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: {
    kind: 'attachment',
    parentId: 'left-rail',
    face: '-y',
    alongMm: 0,
    fromEnd: 'start',
  },
};

const jointsFor = (parts) => jointsOf(resolveAssembly(parts));

test('anchored parts make no joints', () => {
  assert.deepEqual(jointsFor([rail('left-rail', -280), rail('right-rail', 280)]), []);
});

test('an attachment joins the part to the face it hangs from', () => {
  const joints = jointsFor([rail('left-rail', -280), rail('right-rail', 280), crossmember, post]);
  assert.deepEqual(
    joints.find((joint) => joint.partId === 'post'),
    { id: 'post@rear', partId: 'post', toPartId: 'rear', toFace: '+y' },
  );
});

test('both ends of a span make a joint, at the facing faces', () => {
  const joints = jointsFor([rail('left-rail', -280), rail('right-rail', 280), crossmember]);
  assert.deepEqual(joints, [
    { id: 'rear@left-rail', partId: 'rear', toPartId: 'left-rail', toFace: '+x' },
    { id: 'rear@right-rail', partId: 'rear', toPartId: 'right-rail', toFace: '-x' },
  ]);
});

test('the open end of a span makes no joint', () => {
  const short = rail('right-rail', 280, 50);
  const joints = jointsFor([rail('left-rail', -280), short, { ...crossmember, lengthMm: 520 }]);
  assert.deepEqual(
    joints.map((joint) => joint.id),
    ['rear@left-rail'],
  );
});

test('a foot is fastened by its own adapter, so it makes no joint', () => {
  assert.deepEqual(jointsFor([rail('left-rail', -280), foot]), []);
});
