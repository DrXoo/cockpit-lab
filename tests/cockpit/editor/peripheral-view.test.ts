import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { peripheralPanelHTML } from '../../../src/cockpit/editor/peripheral-view.ts';
import { draftPeripheral, editPeripheral } from '../../../src/cockpit/cad/history/peripherals.ts';
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
    ['generic-seat', 'generic-wheel-base', 'generic-pedals'],
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
