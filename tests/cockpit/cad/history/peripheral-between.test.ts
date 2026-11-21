import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  dependentsOf,
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import { ofKind, present } from '../../../support/lookups.ts';
import {
  draftPeripheral,
  editPeripheral,
  editPeripheralDraft,
  secondProfiles,
  swapPeripheralType,
} from '../../../../src/cockpit/cad/history/peripherals.ts';
import { unsupportedParts } from '../../../../src/cockpit/cad/analysis/support.ts';
import { railHistory, seatRails, withPeripheral, withPlate } from '../../../support/designs.ts';

/** The seat rails with a third profile (part-3) changed as given. */
const withThird = (values: Parameters<typeof editProfile>[2]) => {
  const { history, partId } = addAnchoredProfile(seatRails());
  return editProfile(history, partId, { name: 'Third', ...values });
};

const boxOf = (history: readonly Operation[], partId: string) =>
  present(replayDesign(history).resolved.get(partId), partId).box;
const centerOf = (history: readonly Operation[], partId: string) => {
  const { min, max } = boxOf(history, partId);
  return { x: (min.x + max.x) / 2, z: (min.z + max.z) / 2, bottomMm: min.y };
};

test('a seat mounted between two rails is centered between them, placed along the first', () => {
  const seat = withPeripheral(seatRails(), 'part-1', 'generic-seat', {
    betweenId: 'part-2',
    alongMm: 300,
  });
  assert.deepEqual(centerOf(seat, 'part-3'), { x: 0, z: 300, bottomMm: 40 });
});

test('its offset across measures from the middle between the rails, and keeps it between them', () => {
  const offset = withPeripheral(seatRails(), 'part-1', 'generic-seat', {
    betweenId: 'part-2',
    acrossMm: 25,
  });
  assert.equal(centerOf(offset, 'part-3').x, 25);
  assert.throws(
    () =>
      withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-2', acrossMm: 190 }),
    /off the middle between Left rail and Right rail is more than half the 360 mm between them/,
  );
});

test('a peripheral is mounted between two separate profiles, not between a profile and itself', () => {
  assert.throws(
    () => withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-1' }),
    /between two profiles, not between Left rail and itself/,
  );
  assert.throws(
    () => withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-9' }),
    /It is mounted between Left rail and a part that was deleted/,
  );
});

test('a peripheral is mounted between two profiles only', () => {
  const plated = withPlate(seatRails(), 'part-2', { name: 'Plate' });
  assert.throws(
    () => withPeripheral(plated, 'part-1', 'generic-seat', { betweenId: 'part-3' }),
    /between two profiles, and Plate is not one/,
  );
  assert.throws(
    () => withPeripheral(plated, 'part-3', 'generic-seat', { betweenId: 'part-1' }),
    /between two profiles, and Plate is not one/,
  );
});

test('between two profiles, a peripheral rests on their sides, not on their ends', () => {
  assert.throws(
    () =>
      withPeripheral(seatRails(), 'part-1', 'generic-pedals', {
        betweenId: 'part-2',
        face: '+z',
        alongMm: 0,
      }),
    /rests on the sides of two profiles, not on an end of Left rail/,
  );
});

test('the two profiles run parallel', () => {
  const across = withThird({ axis: 'x', lengthMm: 600, startMm: { x: -300, y: 20, z: 800 } });
  assert.throws(
    () => withPeripheral(across, 'part-1', 'generic-seat', { betweenId: 'part-3' }),
    /Third is not parallel to Left rail/,
  );
});

test('the faces it rests on are level with each other', () => {
  const higher = withThird({ lengthMm: 1000, startMm: { x: -180, y: 30, z: 0 } });
  assert.throws(
    () => withPeripheral(higher, 'part-1', 'generic-seat', { betweenId: 'part-3' }),
    /would not sit level: the face of Third is 10 mm off that of Left rail/,
  );
});

test('the two profiles lie apart, with the peripheral over both', () => {
  const alongside = withThird({ lengthMm: 1000, startMm: { x: 160, y: 20, z: 0 } });
  assert.throws(
    () => withPeripheral(alongside, 'part-1', 'generic-seat', { betweenId: 'part-3' }),
    /Left rail and Third overlap: a peripheral goes between two profiles apart/,
  );
  // 600 mm apart, the 540 mm wide seat centered between them reaches neither.
  assert.throws(
    () => withPeripheral(seatRails(600), 'part-1', 'generic-seat', { betweenId: 'part-2' }),
    /^Error: Bucket seat would not sit over Left rail\.$/,
  );
  const short = withThird({ lengthMm: 200, startMm: { x: -180, y: 20, z: 0 } });
  assert.throws(
    () => withPeripheral(short, 'part-1', 'generic-seat', { betweenId: 'part-3', alongMm: 800 }),
    /would not sit over Third/,
  );
});

test('a peripheral between two profiles does not rest the holes of one side on either', () => {
  assert.throws(
    () =>
      withPeripheral(seatRails(), 'part-1', 'generic-seat', {
        betweenId: 'part-2',
        holesOver: 'left',
      }),
    /between two profiles is centered between them, and does not rest on its left holes/,
  );
});

test('at either end of its travel, the peripheral still sits over both profiles', () => {
  const short = withThird({ lengthMm: 600, startMm: { x: -180, y: 20, z: 0 } });
  // At 900 mm the seat, 700 mm deep, reaches 50 mm over Third; 100 mm on along its rails, none.
  assert.throws(
    () => withPeripheral(short, 'part-1', 'generic-seat', { betweenId: 'part-3', alongMm: 900 }),
    /At one end of its 200 mm travel, .* would no longer sit over Third/,
  );
});

test('the peripheral depends on both profiles, and goes with either', () => {
  const seat = withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-2' });
  assert.ok(dependentsOf(seat, 'part-2').has('part-3'));
  assert.equal(replayDesign(removePart(seat, 'part-2')).resolved.has('part-3'), false);
  assert.equal(replayDesign(removePart(seat, 'part-1')).resolved.has('part-3'), false);
});

test('bolted to both profiles, the peripheral carries one with the other', () => {
  const footed = addFoot(seatRails(), 'part-1').history;
  const seat = withPeripheral(footed, 'part-1', 'generic-seat', { betweenId: 'part-2' });
  assert.deepEqual(unsupportedParts(replayDesign(footed).resolved), ['part-2']);
  assert.deepEqual(unsupportedParts(replayDesign(seat).resolved), []);
  const footedOnRight = addFoot(seatRails(), 'part-2').history;
  const seatOnRight = withPeripheral(footedOnRight, 'part-1', 'generic-seat', {
    betweenId: 'part-2',
  });
  assert.deepEqual(unsupportedParts(replayDesign(seatOnRight).resolved), []);
});

/** The peripheral the seat rails mount at their third step. */
const mounted = (history: readonly Operation[]) => ofKind(history[2], 'mount-peripheral');

test('choosing a second profile centers the peripheral between the two', () => {
  const onOne = withPeripheral(seatRails(), 'part-1', 'generic-seat', {
    holesOver: 'left',
    acrossMm: 5,
  });
  const between = mounted(editPeripheral(onOne, 'part-3', { betweenId: 'part-2' }));
  assert.equal(between.betweenId, 'part-2');
  assert.equal(between.acrossMm, 0);
  assert.equal(between.holesOver, undefined);
  const renamed = editPeripheral(onOne, 'part-3', { betweenId: 'part-2' });
  assert.equal(mounted(editPeripheral(renamed, 'part-3', { name: 'Seat' })).betweenId, 'part-2');
  const alone = mounted(editPeripheral(renamed, 'part-3', { betweenId: null }));
  assert.equal(alone.betweenId, undefined);
  assert.equal(alone.acrossMm, 0);
});

test('choosing the side it rests on leaves the second profile', () => {
  const between = withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-2' });
  const onLeft = mounted(editPeripheral(between, 'part-3', { holesOver: 'left' }));
  assert.equal(onLeft.holesOver, 'left');
  assert.equal(onLeft.betweenId, undefined);
});

test('swapping its type keeps it between the two profiles', () => {
  const between = withPeripheral(seatRails(), 'part-1', 'generic-pedals', { betweenId: 'part-2' });
  assert.equal(mounted(swapPeripheralType(between, 'part-3', 'generic-seat')).betweenId, 'part-2');
});

test('a new seat on a rail goes between it and the nearest profile it can', () => {
  const far = withThird({ lengthMm: 1000, startMm: { x: -600, y: 20, z: 0 } });
  assert.equal(draftPeripheral(far, 'part-1', 'generic-seat').betweenId, 'part-2');
  assert.equal(draftPeripheral(far, 'part-2', 'generic-seat').betweenId, 'part-1');
});

test('a new seat with no profile to go between stays on its rail, and other peripherals always do', () => {
  const alone = draftPeripheral(railHistory(), 'part-1', 'generic-seat');
  assert.equal(alone.betweenId, undefined);
  assert.equal(alone.holesOver, undefined);
  assert.equal(draftPeripheral(seatRails(), 'part-1', 'generic-pedals').betweenId, undefined);
});

test('a new seat goes between two rails only where its holes bolt into both', () => {
  // 240 mm apart, the rails are 120 mm narrower than the seat's holes.
  const narrow = seatRails(240);
  const onLeft = draftPeripheral(narrow, 'part-1', 'generic-seat');
  assert.equal(onLeft.betweenId, undefined);
  // Its left holes rest on Left rail, so it stands towards Right rail, on the driver's right.
  assert.equal(onLeft.holesOver, 'left');
  assert.equal(onLeft.acrossMm, 0);
  assert.equal(draftPeripheral(narrow, 'part-2', 'generic-seat').holesOver, 'right');
  const fits = draftPeripheral(seatRails(), 'part-1', 'generic-seat');
  assert.equal(fits.betweenId, 'part-2');
  assert.equal(fits.holesOver, undefined);
});

test('a second profile says why the holes would not bolt into it, though the seat could go between', () => {
  const history = seatRails(380);
  const draft = draftPeripheral(history, 'part-1', 'generic-seat');
  const [right] = secondProfiles(history, draft);
  assert.equal(right?.reason, null);
  assert.match(right?.holesOff ?? '', /hole 1 is 10 mm off the slot of Right rail/);
  const [fitting] = secondProfiles(
    seatRails(),
    draftPeripheral(seatRails(), 'part-1', 'generic-seat'),
  );
  assert.equal(fitting?.holesOff, null);
});

test('the profiles a peripheral can go between come nearest first, then the others with why not', () => {
  // Third, 540 mm from Left rail, is as far as the 540 mm wide seat still sits over both.
  let history = withThird({ lengthMm: 1000, startMm: { x: -360, y: 20, z: 0 } });
  const { history: withFourth, partId } = addAnchoredProfile(history);
  history = editProfile(withFourth, partId, {
    name: 'Crossmember',
    axis: 'x',
    lengthMm: 600,
    startMm: { x: -300, y: 20, z: 900 },
  });
  const draft = editPeripheralDraft(history, draftPeripheral(history, 'part-1', 'generic-seat'), {
    betweenId: null,
  });
  const choices = secondProfiles(history, draft);
  assert.deepEqual(
    choices.map(({ partId, name }) => [partId, name]),
    [
      ['part-2', 'Right rail'],
      ['part-3', 'Third'],
      ['part-4', 'Crossmember'],
    ],
  );
  assert.deepEqual(
    choices.map(({ reason }) => reason === null),
    [true, true, false],
  );
  assert.match(choices[2]?.reason ?? '', /Crossmember is not parallel to Left rail/);
});
