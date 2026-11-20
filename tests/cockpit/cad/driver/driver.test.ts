import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAssembly,
  type ContactRole,
  type Hand,
  type Part,
  type PeripheralPart,
  type Vec3Mm,
} from '../../../../src/cockpit/cad/parts/assembly.ts';
import type { PeripheralCategory } from '../../../../src/cockpit/cad/parts/catalog.ts';
import {
  seatedDriver,
  type Driver,
  type DriverJoint,
  type SeatedDriver,
} from '../../../../src/cockpit/cad/driver/driver.ts';
import { present } from '../../../support/lookups.ts';

type Seated = Extract<SeatedDriver, { kind: 'seated' }>;

const CATEGORY_OF: Record<ContactRole, PeripheralCategory> = {
  hip: 'seat',
  heel: 'pedals',
  hands: 'wheel-base',
  grip: 'center-stick',
};
import { replayDesign } from '../../../../src/cockpit/cad/history/history.ts';
import { railHistory, withGrowth, withPeripheral } from '../../../support/designs.ts';

/** A peripheral anchored with its mounting origin at `startMm`, its one contact point there. */
const peripheral = (
  id: string,
  role: ContactRole,
  startMm: Vec3Mm,
  changes: Partial<PeripheralPart> = {},
): PeripheralPart => ({
  kind: 'peripheral',
  id,
  name: id,
  category: CATEGORY_OF[role],
  envelope: { widthMm: 400, heightMm: 200, depthMm: 400 },
  mountingPattern: { holes: [] },
  contactPoints: [{ role, offsetMm: { x: 0, y: 0, z: 0 } }],
  source: { kind: 'estimated', reference: 'test' },
  facing: '+z',
  placement: { kind: 'anchor', startMm },
  ...changes,
});
/** An upright seat with its hip point at x = 100, y = 300. */
const seat = (changes: Partial<PeripheralPart> = {}) =>
  peripheral('seat', 'hip', { x: 100, y: 300, z: 0 }, { backrestDeg: 0, ...changes });
const pedals = (zMm: number) => peripheral('pedals', 'heel', { x: 100, y: 300, z: zMm });
const wheel = (zMm: number, yMm = 650) => peripheral('wheel', 'hands', { x: 100, y: yMm, z: zMm });
const DRIVER: Driver = { statureMm: 1750 };

/** The driver seated among `parts`, failing the test when it cannot be. */
function seated(parts: readonly Part[], driver = DRIVER): Seated {
  const fit = seatedDriver(resolveAssembly(parts), driver);
  assert.equal(fit.kind, 'seated', 'The driver is not seated.');
  return fit;
}
/** Why the driver cannot be seated among `parts`. */
function unseatedReason(parts: readonly Part[]): string {
  const fit = seatedDriver(resolveAssembly(parts), DRIVER);
  assert.equal(fit.kind, 'unseated', 'The driver is seated.');
  return fit.reason;
}
const angleOf = (fit: Seated, joint: DriverJoint) =>
  present(
    fit.angles.find((angle) => angle.joint === joint),
    `${joint} angle`,
  );

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
  assert.deepEqual(fit.reach, { legs: false, arms: false, grips: [] });
  const near = seated([seat(), pedals(800), wheel(400)]);
  assert.deepEqual(near.reach, { legs: true, arms: true, grips: [] });
});

test('without a wheel, the hands hold nothing and there is no elbow angle', () => {
  const fit = seated([seat(), pedals(800)]);
  assert.equal(fit.reach.arms, null);
  assert.deepEqual(fit.figure.arms, []);
  assert.ok(!fit.angles.some((angle) => angle.joint === 'elbow'));
});

test('a design without a seat and pedals, or a seat facing up or down, seats no driver', () => {
  assert.match(unseatedReason([pedals(800)]), /seat/);
  assert.match(unseatedReason([seat()]), /pedals/);
  let history = withGrowth(railHistory(), 'part-1', { name: 'Post', lengthMm: 600 });
  history = withPeripheral(history, 'part-1', 'generic-pedals', { alongMm: 900 });
  history = withPeripheral(history, 'part-2', 'generic-seat', { face: '+x', facing: '+y' });
  const upwards = seatedDriver(replayDesign(history).resolved, DRIVER);
  assert.equal(upwards.kind, 'unseated');
  assert.match(upwards.reason, /faces up or down/);
});

test('a taller driver sits with the same hip and higher eyes', () => {
  const tall = seated([seat(), pedals(800)], { statureMm: 1900 });
  assert.deepEqual(tall.figure.hip, { x: 100, y: 300, z: 0 });
  assert.equal(tall.figure.eye.y, 300 + 0.39 * 1900);
});

/** A grip of `category` held by `hand`, its grip at `startMm`. */
const grip = (id: string, category: PeripheralCategory, hand: Hand, startMm: Vec3Mm) =>
  peripheral(id, 'grip', startMm, { category, hand });
/** The seat's shoulder joints: 0.2 of the stature apart, at the top of the upright torso. */
const SHOULDER_Y = 300 + 0.288 * 1750;
const RIGHT_SHOULDER_X = 100 - 0.1 * 1750;
const LEFT_SHOULDER_X = 100 + 0.1 * 1750;
const ARM_MM = (0.186 + 0.146) * 1750;
const distance = (a: Vec3Mm, b: Vec3Mm) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const close = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(actual - expected) < 1e-6, `${what}: ${actual} is not ${expected}`);

test('without a wheel, each hand holds its stick or throttle from its own shoulder', () => {
  const stick = grip('stick', 'side-stick', 'right', { x: -75, y: 550, z: 380 });
  const throttle = grip('throttle', 'throttle', 'left', { x: 275, y: 550, z: 380 });
  const fit = seated([seat(), pedals(800), stick, throttle]);
  const [left, right] = fit.figure.arms.toSorted((a, b) => b.hand.x - a.hand.x);
  assert.deepEqual(present(right, 'right arm').hand, { x: -75, y: 550, z: 380 });
  assert.deepEqual(right.shoulder, { x: RIGHT_SHOULDER_X, y: SHOULDER_Y, z: 0 });
  assert.deepEqual(present(left, 'left arm').shoulder, { x: LEFT_SHOULDER_X, y: SHOULDER_Y, z: 0 });
  for (const arm of [left, right]) {
    close(distance(arm.shoulder, arm.elbow), 0.186 * 1750, 'upper arm');
    close(distance(arm.elbow, arm.hand), 0.146 * 1750, 'forearm');
    assert.ok(arm.elbow.y < arm.shoulder.y, 'the elbow hangs below the shoulder');
  }
  assert.deepEqual(
    fit.angles.filter(({ joint }) => joint === 'elbow').map(({ hand }) => hand),
    ['left', 'right'],
  );
  assert.equal(fit.reach.arms, null, 'no wheel to reach');
  assert.deepEqual(
    fit.reach.grips.map(({ partId, hand, held, shortByMm }) => [partId, hand, held, shortByMm]),
    [
      ['stick', 'right', true, 0],
      ['throttle', 'left', true, 0],
    ],
  );
});

test('facing the back, the right hand is towards +x', () => {
  const backwardSeat = seat({ facing: '-z' });
  const stick = grip('stick', 'center-stick', 'right', { x: 275, y: 550, z: -380 });
  const fit = seated([
    backwardSeat,
    peripheral('pedals', 'heel', { x: 100, y: 300, z: -800 }),
    stick,
  ]);
  assert.equal(present(fit.figure.arms[0], 'right arm').shoulder.x, LEFT_SHOULDER_X);
  assert.equal(present(fit.reach.grips[0], 'stick').shortByMm, 0);
});

test('a shifter or a handbrake only has its reach checked, by how far it is beyond', () => {
  const near = grip('shifter', 'shifter', 'right', { x: -75, y: 500, z: 300 });
  const far = grip('handbrake', 'handbrake', 'right', {
    x: RIGHT_SHOULDER_X,
    y: SHOULDER_Y,
    z: ARM_MM + 50,
  });
  const fit = seated([seat(), pedals(800), near, far]);
  assert.deepEqual(fit.figure.arms, []);
  assert.ok(!fit.angles.some(({ joint }) => joint === 'elbow'));
  const reach = fit.reach.grips.map(({ partId, held, shortByMm }) => [partId, held, shortByMm]);
  assert.deepEqual(reach[0], ['shifter', false, 0]);
  assert.equal(present(reach[1], 'handbrake')[1], false);
  close(Number(present(reach[1], 'handbrake')[2]), 50, 'beyond the reach');
});

test('a stick out of reach is still held, and how far it is beyond is reported', () => {
  const stick = grip('stick', 'center-stick', 'right', {
    x: RIGHT_SHOULDER_X,
    y: SHOULDER_Y,
    z: ARM_MM + 120,
  });
  const fit = seated([seat(), pedals(800), stick]);
  assert.equal(fit.figure.arms.length, 1);
  close(present(fit.reach.grips[0], 'stick').shortByMm, 120, 'beyond the reach');
});

test('with a wheel on, both hands are on it and a stick is only reached for', () => {
  const stick = grip('stick', 'side-stick', 'right', { x: -75, y: 550, z: 380 });
  const fit = seated([seat(), pedals(800), wheel(400), stick]);
  assert.equal(fit.figure.arms.length, 1);
  assert.deepEqual(present(fit.figure.arms[0], 'wheel arm').hand, { x: 100, y: 650, z: 400 });
  assert.equal(fit.reach.arms, true);
  assert.equal(present(fit.reach.grips[0], 'stick').held, false);
  assert.deepEqual(
    fit.angles.filter(({ joint }) => joint === 'elbow').map(({ hand }) => hand),
    [undefined],
  );
});

test('two sticks or throttles for one hand are reported, and the hand holds neither', () => {
  const stick = grip('stick', 'side-stick', 'right', { x: -75, y: 550, z: 380 });
  const throttle = grip('throttle', 'throttle', 'right', { x: -75, y: 550, z: 300 });
  const shifter = grip('shifter', 'shifter', 'right', { x: -75, y: 500, z: 300 });
  const fit = seated([seat(), pedals(800), stick, throttle, shifter]);
  assert.deepEqual(fit.doubledGrips, [{ hand: 'right', names: ['stick', 'throttle'] }]);
  assert.deepEqual(fit.figure.arms, []);
  assert.ok(fit.reach.grips.every(({ held }) => !held));
  assert.deepEqual(seated([seat(), pedals(800), stick, shifter]).doubledGrips, []);
});
