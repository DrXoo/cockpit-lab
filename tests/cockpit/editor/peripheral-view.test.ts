import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { peripheralPanelHTML } from '../../../src/cockpit/editor/peripheral-view.ts';
import {
  draftPeripheral,
  editPeripheral,
  editPeripheralDraft,
} from '../../../src/cockpit/cad/history/peripherals.ts';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
} from '../../../src/cockpit/cad/history/history.ts';
import {
  anchoredProfiles,
  plateHistory,
  railHistory,
  seatRails,
  withPeripheral,
} from '../../support/designs.ts';
import { captured } from '../../support/lookups.ts';

const railWithPedals = () => withPeripheral(railHistory(), 'part-1', 'generic-pedals');

test('the inspector of a peripheral sets its place on its part and the way it faces', () => {
  const history = railWithPedals();
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Mounted on <strong>Rail<\/strong>/);
  assert.match(html, /id="part-name"[^>]*value="Pedal set"/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.match(html, /id="part-facing"/);
  assert.match(html, /<option value="\+z" selected>Towards the front \(\+Z\)<\/option>/);
  assert.doesNotMatch(html, /id="part-facing"[^]*<option value="-y"/, 'it faces along its face');
  assert.match(html, /id="part-alongMm"[^>]*value="500"/);
  assert.match(html, /id="part-acrossMm"[^>]*value="0"/);
  assert.match(html, /estimated/);
});

test('the inspector of a peripheral sets its type and the values copied from it', () => {
  const history = railWithPedals();
  const html = partInspectorHTML(history, history[1]);
  const types = captured(/id="part-typeId"[^]*?<\/select>/, html, 0);
  assert.deepEqual(
    [...types.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    [
      'generic-seat',
      'generic-wheel-base',
      'generic-pedals',
      'generic-shifter',
      'generic-handbrake',
      'generic-center-stick',
      'generic-side-stick',
      'generic-throttle',
    ],
  );
  assert.match(types, /<option value="generic-pedals" selected>Pedal set<\/option>/);
  assert.match(html, /id="part-widthMm"[^>]*value="400"/);
  assert.match(html, /id="part-heightMm"[^>]*value="200"/);
  assert.match(html, /id="part-depthMm"[^>]*value="320"/);
  assert.doesNotMatch(html, /id="part-backrestDeg"/, 'only a seat has a backrest');
  assert.equal([...html.matchAll(/data-hole-row=/g)].length, 4);
  assert.match(html, /id="part-holeXMm-0"[^>]*data-part-item="0"[^>]*value="-160"/);
  assert.match(html, /id="part-holeYMm-3"[^>]*value="120"/);
  assert.match(html, /id="part-holeDiameterMm-2"[^>]*value="8.5"/);
  assert.match(html, /data-remove-hole="3"/);
  assert.match(html, /id="addHole"/);
  assert.match(html, /Heels/);
  assert.match(html, /id="part-contactZMm-heel"[^>]*data-part-item="heel"[^>]*value="-130"/);
  assert.doesNotMatch(html, /Edited from its type/);
  assert.doesNotMatch(html, /id="part-hand"/, 'pedals have no grip');
});

test('the inspector of a peripheral chooses what rests on its place: its origin or the holes of a side', () => {
  const history = editPeripheral(railWithPedals(), 'part-2', { holesOver: 'right' });
  const html = partInspectorHTML(history, history[1]);
  const sides = captured(/id="part-holesOver"[^]*?<\/select>/, html, 0);
  assert.deepEqual(
    [...sides.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ['origin', 'left', 'right'],
  );
  assert.match(sides, /<option value="right" selected>Its right holes<\/option>/);
});

test('the inspector of a peripheral with a grip chooses the hand that uses it', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-throttle');
  const html = partInspectorHTML(history, history[1]);
  const hands = captured(/id="part-hand"[^]*?<\/select>/, html, 0);
  assert.deepEqual(
    [...hands.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ['left', 'right'],
  );
  assert.match(hands, /<option value="left" selected>Left hand<\/option>/);
  assert.match(html, /Grip/);
  assert.match(html, /id="part-contactYMm-grip"[^>]*value="170"/);
});

test('the inspector of a seat sets its backrest, and says when its values are edited', () => {
  const plain = editProfile(anchoredProfiles(1), 'part-1', { lengthMm: 1000 });
  const mounted = withPeripheral(plain, 'part-1', 'generic-seat');
  const history = editPeripheral(mounted, 'part-2', { backrestDeg: 30 });
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /id="part-backrestDeg"[^>]*value="30"[^>]*>.*?°/s);
  assert.match(html, /✎ Edited from its type/);
  assert.match(html, /Hip/);
});

test('a peripheral on a plate is mounted on one of its two faces', () => {
  const history = withPeripheral(plateHistory(), 'part-2', 'generic-seat');
  const html = partInspectorHTML(history, history[2]);
  assert.match(html, /Mounted on <strong>Plate 2<\/strong>/);
  const faces = captured(/id="part-face"[^]*?<\/select>/, html, 0);
  assert.deepEqual(
    [...faces.matchAll(/<option value="([^"]+)"/g)].map((match) => match[1]),
    ['+y', '-y'],
  );
});

test('a peripheral about to be mounted is placed in its panel; its own values wait for its inspector', () => {
  const history = railHistory();
  const html = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-pedals'));
  assert.match(html, /400 × 200 × 320 mm/);
  assert.doesNotMatch(html, /peripheral-widthMm|peripheral-typeId|data-hole-row/);
});

test('the peripheral panel edits the new peripheral before it is mounted', () => {
  const history = railHistory();
  const html = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-seat'));
  assert.match(html, /A new seat on <strong>Rail<\/strong>/);
  assert.match(html, /id="peripheral-alongMm"/);
  assert.match(html, /id="confirmPeripheral"/);
  assert.match(html, /id="cancelPeripheral"/);
});

test('in Fit, a seat shows the travel of its rails, and a span says why it has none', () => {
  const rail = railHistory();
  const seat = withPeripheral(rail, 'part-1', 'generic-seat');
  const html = partInspectorHTML(seat, seat[1], undefined, [], [], { fitting: true });
  assert.match(html, /id="adjustmentTravel"[^>]*value="200"/);
  assert.match(html, /id="part-facing"/, 'with its own values');
  let history = editProfile(addAnchoredProfile(rail).history, 'part-2', {
    name: 'Other rail',
    lengthMm: 1000,
    startMm: { x: 500, y: 20, z: 0 },
  });
  const crossing = editDraft(history, draftGrowth(history, 'part-1'), {
    face: '+x',
    lengthMm: 200,
  });
  history = editProfile(addOperation(history, crossing), 'part-3', { reachesId: 'part-2' });
  const span = partInspectorHTML(history, history[2], undefined, [], [], { fitting: true });
  assert.match(span, /id="adjustmentNone"/);
  assert.doesNotMatch(span, /id="addAdjustment"/);
});

test('a new seat between two rails names both, and chooses the second among those it can go between', () => {
  const history = seatRails();
  const html = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-seat'));
  assert.match(
    html,
    /A new seat between <strong>Left rail<\/strong> and <strong>Right rail<\/strong>/,
  );
  const between = captured(/id="peripheral-betweenId"[^]*?<\/select>/, html, 0);
  assert.match(between, /<option value="part-2" selected>Right rail<\/option>/);
  assert.match(between, /<option value="alone">Nothing: on Left rail alone<\/option>/);
  assert.match(html, /id="peripheral-acrossMm"/);
  assert.match(html, /Offset from the middle between them/);
  assert.doesNotMatch(html, /peripheral-holesOver/, 'between two rails, it rests on neither side');
  assert.match(
    html,
    /data-fit-check="between"[^>]*class="fit-check ok">✓ Centered between them, 360 mm apart/,
  );
  assert.match(html, /data-fit-check="holes"[^>]*class="fit-check ok">✓ Every hole over a slot/);
});

test('rails apart by other than the seat holes warn for each hole, and the seat can still be mounted', () => {
  const history = seatRails(380);
  const html = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-seat'));
  assert.match(html, /class="fit-check warning">⚠ Hole 1 is 10 mm off the slot of Right rail/);
  assert.match(html, /class="fit-check warning">⚠ Hole 3 is 10 mm off the slot of Left rail/);
  assert.match(html, /id="confirmPeripheral"/);
});

test('a seat on a rail alone can still choose a second, and other peripherals have no second', () => {
  const history = seatRails();
  const alone = editPeripheralDraft(history, draftPeripheral(history, 'part-1', 'generic-seat'), {
    betweenId: null,
  });
  const html = peripheralPanelHTML(history, alone);
  assert.match(html, /A new seat on <strong>Left rail<\/strong>/);
  assert.match(html, /<option value="alone" selected>Nothing: on Left rail alone<\/option>/);
  assert.match(html, /id="peripheral-holesOver"/);
  const pedals = peripheralPanelHTML(history, draftPeripheral(history, 'part-1', 'generic-pedals'));
  assert.doesNotMatch(pedals, /betweenId/);
});

test('the inspector of a seat between two rails changes the second rail', () => {
  const history = withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-2' });
  const html = partInspectorHTML(history, history[2]);
  assert.match(
    html,
    /Mounted between <strong>Left rail<\/strong> and <strong>Right rail<\/strong>/,
  );
  assert.match(html, /id="part-betweenId"[^]*<option value="part-2" selected>Right rail<\/option>/);
});
