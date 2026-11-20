import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { growPanelHTML } from '../../../src/cockpit/editor/profile-view.ts';
import { draftGrowth, editDraft, editProfile } from '../../../src/cockpit/cad/history/history.ts';
import {
  anchoredProfiles,
  growthTowardsRail,
  railHistory,
  withGrowth,
} from '../../support/designs.ts';
import { captured } from '../../support/lookups.ts';

const railAndGrowth = () => withGrowth(railHistory(), 'part-1');

const reachChoices = (html: string) =>
  [
    ...captured(/data-part-field="reachesId"[^>]*>([\s\S]*?)<\/select>/, html).matchAll(
      /value="([^"]*)"( selected)?>([^<]*)</g,
    ),
  ].map(([, value, selected, text]) => [value, Boolean(selected), text]);

test('the inspector edits the values of the operation that made the part', () => {
  const [operation] = editProfile(anchoredProfiles(1), 'part-1', {
    name: 'Seat "rail"',
    sectionId: '40x80',
    lengthMm: 1200,
    startMm: { x: -280, y: 40, z: 12.5 },
  });
  const html = partInspectorHTML([operation], operation);
  const value = (field: string) =>
    new RegExp(`data-part-field="${field}"[^>]*value="([^"]*)"`).exec(html)?.[1];
  assert.equal(value('name'), 'Seat &quot;rail&quot;');
  assert.equal(value('lengthMm'), '1200');
  assert.equal(value('startX'), '-280');
  assert.equal(value('startY'), '40');
  assert.equal(value('startZ'), '12.5');
  assert.match(html, /<option value="40x80" selected>40 × 80<\/option>/);
  assert.match(html, /data-part-field="axis"[\s\S]*<option value="z" selected>/);
});

test('the long side of the section can be turned only on a section that has one', () => {
  const [square] = anchoredProfiles(1);
  assert.doesNotMatch(partInspectorHTML([square], square), /data-part-field="heightAxis"/);
  const [wide] = editProfile([square], 'part-1', { sectionId: '40x80' });
  const html = partInspectorHTML([wide], wide);
  const choices = captured(/data-part-field="heightAxis"[^>]*>([\s\S]*?)<\/select>/, html);
  assert.deepEqual(
    [...choices.matchAll(/value="(\w)"/g)].map(([, axis]) => axis),
    ['x', 'y'],
  );
  assert.match(choices, /value="y" selected/);
});

test('a grown profile says in its inspector what it grows out of, and where', () => {
  const history = railAndGrowth();
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Grows out of <strong>Rail<\/strong>/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.match(html, /<option value="-z">Back end \(−Z\)<\/option>/);
  assert.match(html, /<option value="start" selected>Back end<\/option>/);
  assert.match(html, /data-part-field="alongMm"[^>]*value="500"/);
  assert.doesNotMatch(html, /data-part-field="startX"|data-part-field="axis"/);
});

test('out of an end face there is no distance or offset to give', () => {
  const onEnd = editProfile(railAndGrowth(), 'part-2', { face: '+z' });
  const html = partInspectorHTML(onEnd, onEnd[1]);
  assert.doesNotMatch(html, /data-part-field="alongMm"|data-part-field="acrossMm"/);
});

test('the grow panel edits the new profile before it is added', () => {
  const history = railHistory();
  const draft = editDraft(history, draftGrowth(history, 'part-1'), { lengthMm: 320 });
  const html = growPanelHTML(history, draft);
  assert.match(html, /out of <strong>Rail<\/strong>/);
  assert.match(html, /id="grow-lengthMm"[^>]*value="320"/);
  assert.match(html, /id="confirmGrowth"/);
  assert.match(html, /id="cancelGrowth"/);
});

test('a growth grows out of its face or lies along it, the ways the face allows', () => {
  const history = railAndGrowth();
  const html = partInspectorHTML(history, history[1]);
  const choices = captured(/data-part-field="way"[^>]*>([\s\S]*?)<\/select>/, html);
  assert.deepEqual(
    [...choices.matchAll(/value="([^"]+)"/g)].map(([, way]) => way),
    ['out', '+x', '-x', '+z', '-z'],
  );
  assert.match(choices, /value="out" selected>Out of the face</);
  assert.match(choices, /value="\+z">Along the face, towards the front \(\+Z\)</);
});

test('the end of a grown profile can reach the parts in front of it', () => {
  const history = growthTowardsRail();
  const html = partInspectorHTML(history, history[2]);
  assert.deepEqual(reachChoices(html), [
    ['', true, 'Free, at its own length'],
    ['part-2', false, 'Reaches C'],
  ]);
  // A profile about to grow can reach a part too, from the design as the view shows it.
  const draft = draftGrowth(history, 'part-1');
  const growing = growPanelHTML([...history, draft], draft);
  assert.deepEqual(reachChoices(growing)[0], ['', true, 'Free, at its own length']);
});

test('a span shows its length as the gap, and says when its end no longer meets its part', () => {
  const spanned = editProfile(growthTowardsRail(), 'part-3', { reachesId: 'part-2' });
  const html = partInspectorHTML(spanned, spanned[2]);
  assert.match(html, /id="part-lengthMm"[^>]*value="460"[^>]*disabled/);
  assert.match(html, /length is the gap to C/);
  const away = editProfile(spanned, 'part-2', { startMm: { x: 500, y: 20, z: 600 } });
  const open = partInspectorHTML(away, away[2]);
  assert.match(open, /⚠ Its end no longer meets C/);
  assert.deepEqual(reachChoices(open)[1], ['part-2', true, 'Reaches C (not meeting it)']);
});
