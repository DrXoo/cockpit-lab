import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { addFoot } from '../../../src/cockpit/cad/history/history.ts';
import { anchoredProfiles } from '../../support/designs.ts';

test('the inspector of a foot sets its type and where it stands under its profile', () => {
  const { history } = addFoot(anchoredProfiles(1), 'part-1');
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Stands under <strong>40 × 40 profile 1<\/strong>/);
  assert.match(html, /id="part-footTypeId"[^>]*><option value="leveling-foot" selected>/);
  assert.match(html, /<option value="locking-caster">Locking caster/);
  assert.match(html, /id="part-fromEnd"/);
  assert.match(html, /id="part-alongMm"[^>]*value="36"/);
  assert.match(html, /estimated/);
  assert.doesNotMatch(html, /id="part-lengthMm"/);
});
