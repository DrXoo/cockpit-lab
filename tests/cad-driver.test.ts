import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { seatedDriver } from '../src/cad/driver.ts';
import { replayDesign } from '../src/cad/history.ts';
import { railHistory, withGrowth, withPeripheral } from './support/designs.ts';

/** A peripheral anchored with its mounting origin at `startMm`, its one contact point there. */
const peripheral = (id, role, startMm, changes = {}) => ({
  kind: 'peripheral',
  id,
  name: id,
  envelope: { widthMm: 400, heightMm: 200, depthMm: 400 },
  mountingPattern: { holes: [] },
  contactPoints: [{ role, offsetMm: { x: 0, y: 0, z: 0 } }],
  source: { kind: 'estimated', reference: 'test' },
  facing: '+z',
  placement: { kind: 'anchor', startMm },
  ...changes,
});
/** An upright seat with its hip point at x = 100, y = 300. */
const seat = (changes = {}) =>
  peripheral('seat', 'hip', { x: 100, y: 300, z: 0 }, { backrestDeg: 0, ...changes });
const pedals = (zMm) => peripheral('pedals', 'heel', { x: 100, y: 300, z: zMm });
const wheel = (zMm, yMm = 650) => peripheral('wheel', 'hands', { x: 100, y: yMm, z: zMm });
const DRIVER = { statureMm: 1750 };

const seated = (parts, driver = DRIVER) => seatedDriver(resolveAssembly(parts), driver);
const angleOf = (fit, joint) => fit.angles.find((angle) => angle.joint === joint);

test('the eye point is above the hip by the average proportion of the stature', () => {
  const fit = seated([seat(), pedals(800)]);
  assert.equal(fit.kind, 'seated');
  // 0.39 of the stature from the hip along the upright torso (src/anatomy.ts).
  assert.deepEqual(fit.figure.eye, { x: 100, y: 300 + 0.39 * 1750, z: 0 });
  assert.equal(fit.figure.hip.x, 100, 'the figure stands on the seat’s center plane');
});

test('the torso leans back with the backrest, the way the seat faces', () => {
  const forwards = seated([seat({ backrestDeg: 20 }), pedals(800)]);
  assert.ok(forwards.figure.shoulder.z < 0, 'facing +z, the shoulder is behind the hip');
  const backwards = seated([
    seat({ backrestDeg: 20, facing: '-z' }),
    peripheral('pedals', 'heel', { x: 100, y: 300, z: -800 }),
  ]);
  assert.ok(backwards.figure.shoulder.z > 0, 'facing −z, it is behind the hip towards +z');
  assert.deepEqual(angleOf(backwards, 'knee'), angleOf(forwards, 'knee'));
});

test('the knee, hip and elbow angles are measured against their GT ranges', () => {
  const fit = seated([seat({ backrestDeg: 25 }), pedals(820), wheel(450)]);
  assert.deepEqual(
    fit.angles.map(({ joint, range }) => [joint, range]),
    [
      ['knee', { minDeg: 110, maxDeg: 140 }],
      ['hip', { minDeg: 95, maxDeg: 120 }],
      ['elbow', { minDeg: 90, maxDeg: 130 }],
    ],
  );
  for (const { angleDeg, verdict, range } of fit.angles) {
    const expected =
      angleDeg < range.minDeg ? 'below' : angleDeg > range.maxDeg ? 'above' : 'within';
    assert.equal(verdict, expected);
  }
  assert.equal(angleOf(seated([seat(), pedals(500)]), 'knee').verdict, 'below');
  assert.equal(angleOf(seated([seat(), pedals(855)]), 'knee').verdict, 'above');
});

test('legs or arms that do not reach are reported', () => {
  const fit = seated([seat(), pedals(1000), wheel(900)]);
  assert.deepEqual(fit.reach, { legs: false, arms: false });
  const near = seated([seat(), pedals(800), wheel(400)]);
  assert.deepEqual(near.reach, { legs: true, arms: true });
});

test('without a wheel, the hands hold nothing and there is no elbow angle', () => {
  const fit = seated([seat(), pedals(800)]);
  assert.equal(fit.reach.arms, null);
  assert.equal(fit.figure.hands, null);
  assert.equal(angleOf(fit, 'elbow'), undefined);
});

test('a design without a seat and pedals, or a seat facing up or down, seats no driver', () => {
  assert.match(seated([pedals(800)]).reason, /seat/);
  assert.match(seated([seat()]).reason, /pedals/);
  let history = withGrowth(railHistory(), 'part-1', { name: 'Post', lengthMm: 600 });
  history = withPeripheral(history, 'part-1', 'generic-pedals', { alongMm: 900 });
  history = withPeripheral(history, 'part-2', 'generic-seat', { face: '+x', facing: '+y' });
  const upwards = seatedDriver(replayDesign(history).resolved, DRIVER);
  assert.match(upwards.reason, /faces up or down/);
});

test('a taller driver sits with the same hip and higher eyes', () => {
  const tall = seated([seat(), pedals(800)], { statureMm: 1900 });
  assert.deepEqual(tall.figure.hip, { x: 100, y: 300, z: 0 });
  assert.equal(tall.figure.eye.y, 300 + 0.39 * 1900);
});
