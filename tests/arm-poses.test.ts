import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize } from '../src/model.ts';
import { monitorGeometry, wrapAngle } from '../src/monitor-arm.ts';
import {
  MAX_ARM_POSES,
  saveArmPose,
  applyArmPose,
  deleteArmPose,
  activeArmPose,
  armPoseMountMoved,
  updateArmPose,
  monitorPositionOf,
  chooseMonitorPosition,
} from '../src/arm-poses.ts';

const EPSILON = 1e-9;
const close = (actual, expected, message) =>
  assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: ${actual} vs ${expected}`);
const samePoint = (actual, expected) => {
  close(actual.x, expected.x, 'x');
  close(actual.z, expected.z, 'z');
};

test('saving a pose records the arm as it stands, even when an automatic mode placed it', () => {
  const s = { ...defaults, monitorMode: 'cockpit' };
  const g = monitorGeometry(s);
  const saved = saveArmPose(s, 'Racing');
  // The arm now holds the saved pose: same place, joints kept by hand.
  assert.equal(saved.monitorMode, 'manual');
  assert.equal(activeArmPose(saved)?.name, 'Racing');
  samePoint(monitorGeometry(saved).point, g.point);
  assert.equal(saved.armPoses.length, 1);
  const [pose] = saved.armPoses;
  assert.equal(pose.name, 'Racing');
  close(pose.armBaseAngle, g.arm.baseAngle, 'base');
  close(pose.armElbowAngle, g.arm.elbowAngle, 'elbow');
  close(pose.monitorYaw, wrapAngle(g.angle - s.deskAngle), 'yaw');
  assert.equal(pose.monitorH, s.monitorH);
});

test('a pose puts the monitor back where it was, without working out the angles again', () => {
  const s = saveArmPose({ ...defaults, monitorMode: 'cockpit' }, 'Racing');
  const recorded = monitorGeometry(s);
  const elsewhere = { ...s, monitorMode: 'desk', cockpitX: s.cockpitX + 40, monitorH: 90 };

  const back = applyArmPose(elsewhere, s.armPoses[0].id);
  assert.equal(back.monitorMode, 'manual');
  assert.equal(back.monitorH, s.monitorH);
  const g = monitorGeometry(back);
  samePoint(g.point, recorded.point);
  samePoint(g.arm.elbow, recorded.arm.elbow);
  close(g.angle, recorded.angle, 'screen angle');
});

test('the active pose is the one the arm is in', () => {
  const racing = saveArmPose(defaults, 'Racing');
  const s = saveArmPose({ ...racing, monitorH: racing.monitorH + 10 }, 'Desk');
  assert.equal(activeArmPose(s)?.name, 'Desk');
  const back = applyArmPose(s, 'pose-1');
  assert.equal(activeArmPose(back)?.name, 'Racing');
  assert.equal(activeArmPose({ ...back, monitorH: back.monitorH + 5 }), undefined);
  assert.equal(activeArmPose({ ...back, monitorMode: 'desk' }), undefined);
});

test('saving under an existing name records that pose again in its place', () => {
  const first = saveArmPose(saveArmPose(defaults, 'Racing'), 'Desk');
  const moved = saveArmPose({ ...first, monitorH: 120 }, ' racing ');
  assert.deepEqual(
    moved.armPoses.map((pose) => [pose.id, pose.name, pose.monitorH]),
    [
      [first.armPoses[0].id, 'Racing', 120],
      [first.armPoses[1].id, 'Desk', first.monitorH],
    ],
  );
});

test('a blank name gets a numbered one, and names are cleaned like other names', () => {
  const s = saveArmPose(saveArmPose(defaults, '   '), '<b>Flight</b>');
  assert.deepEqual(
    s.armPoses.map((pose) => pose.name),
    ['Pose 1', 'bFlight/b'],
  );
});

test('poses can be deleted, and there is a limit to how many a layout keeps', () => {
  let s = defaults;
  for (let i = 0; i < MAX_ARM_POSES; i++) s = saveArmPose(s, `Pose ${i}`);
  assert.throws(() => saveArmPose(s, 'One more'), /Arm pose limit reached/);
  const fewer = deleteArmPose(s, s.armPoses[0].id);
  assert.equal(fewer.armPoses.length, MAX_ARM_POSES - 1);
  assert.equal(saveArmPose(fewer, 'One more').armPoses.length, MAX_ARM_POSES);
  assert.throws(() => applyArmPose(s, 'missing'), /Unknown arm pose/);
});

test('a pose knows when the arm mount has moved since it was saved', () => {
  const s = saveArmPose({ ...defaults, clampMount: 'grommet', clampX: 0, clampZ: 0 }, 'Racing');
  const [pose] = s.armPoses;
  assert.equal(armPoseMountMoved(s, pose), false);
  assert.equal(armPoseMountMoved({ ...s, clampX: 10 }, pose), true);
  assert.equal(armPoseMountMoved({ ...s, clampMount: 'clamp' }, pose), true);
  assert.equal(armPoseMountMoved({ ...s, deskX: s.deskX + 50 }, pose), false);
});

test('saved poses survive validation, and files without them have none', () => {
  const s = saveArmPose(defaults, 'Racing');
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(s))).armPoses, s.armPoses);
  assert.deepEqual(sanitize({}).armPoses, []);
});

test('invalid saved poses are rejected', () => {
  const [pose] = saveArmPose(defaults, 'Racing').armPoses;
  for (const armPoses of [
    'Racing',
    [null],
    [{ ...pose, armBaseAngle: 'left' }],
    [{ ...pose, id: '' }],
    [pose, pose],
    [{ ...pose, mount: { ...pose.mount, clampMount: 'tape' } }],
  ])
    assert.throws(() => sanitize({ armPoses }), /Invalid arm pose/, JSON.stringify(armPoses));
});

test('updating a pose records the arm as it stands now, keeping its name and place', () => {
  const s = saveArmPose(saveArmPose(defaults, 'Racing'), 'Desk');
  const moved = { ...applyArmPose(s, 'pose-1'), monitorH: 120, armBaseAngle: 30 };
  const updated = updateArmPose(moved, 'pose-1');
  assert.deepEqual(
    updated.armPoses.map((pose) => [pose.id, pose.name]),
    [
      ['pose-1', 'Racing'],
      ['pose-2', 'Desk'],
    ],
  );
  assert.equal(updated.armPoses[0].monitorH, 120);
  assert.equal(updated.armPoses[0].armBaseAngle, 30);
  assert.equal(activeArmPose(updated)?.id, 'pose-1');
  assert.throws(() => updateArmPose(s, 'missing'), /Unknown arm pose/);
});

test('the monitor position shows the pose the arm is in, the automatic mode or a custom pose', () => {
  const s = saveArmPose(defaults, 'Racing');
  assert.deepEqual(monitorPositionOf({ ...s, monitorMode: 'desk' }, 'pose-1'), {
    choice: 'auto:desk',
    changed: false,
  });
  const racing = applyArmPose(s, 'pose-1');
  assert.deepEqual(monitorPositionOf(racing, ''), { choice: 'pose:pose-1', changed: false });
  const nudged = { ...racing, monitorH: racing.monitorH + 4 };
  assert.deepEqual(monitorPositionOf(nudged, 'pose-1'), { choice: 'pose:pose-1', changed: true });
  assert.deepEqual(monitorPositionOf(nudged, ''), { choice: 'custom', changed: false });
  assert.deepEqual(monitorPositionOf(nudged, 'deleted'), { choice: 'custom', changed: false });
});

test('choosing a monitor position applies a pose, an automatic mode or keeps the joints', () => {
  const s = saveArmPose({ ...defaults, monitorMode: 'cockpit' }, 'Racing');
  assert.equal(chooseMonitorPosition(s, 'auto:desk').monitorMode, 'desk');
  assert.equal(activeArmPose(chooseMonitorPosition(s, 'pose:pose-1'))?.id, 'pose-1');
  const custom = chooseMonitorPosition(s, 'custom');
  assert.equal(custom.monitorMode, 'manual');
  assert.equal(custom.armBaseAngle, s.armPoses[0].armBaseAngle);
  assert.throws(() => chooseMonitorPosition(s, 'auto:moon'), /Unknown monitor position/);
});
