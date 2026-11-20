import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveAssembly,
  type ContactRole,
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
  assert.deepEqual(fit.reach, { legs: false, arms: false });
  const near = seated([seat(), pedals(800), wheel(400)]);
  assert.deepEqual(near.reach, { legs: true, arms: true });
});

test('without a wheel, the hands hold nothing and there is no elbow angle', () => {
  const fit = seated([seat(), pedals(800)]);
  assert.equal(fit.reach.arms, null);
  assert.equal(fit.figure.hands, null);
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
