import test from 'node:test';
import assert from 'node:assert/strict';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { platePanelHTML } from '../../../src/cockpit/editor/plate-view.ts';
import { draftPlate } from '../../../src/cockpit/cad/history/plates.ts';
import { plateHistory, railHistory } from '../../support/designs.ts';

test('the inspector of a plate sets its sheet, process, size and place on its profile', () => {
  const history = plateHistory();
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /Rests on <strong>Rail<\/strong>/);
  assert.match(html, /id="part-sheetId"[^>]*><option value="aluminium-3">/);
  assert.match(html, /<option value="aluminium-8" selected>Aluminium sheet, 8 mm/);
  assert.match(html, /estimated/);
  assert.match(html, /<option value="laser-cutting" selected>Laser or water-jet cutting/);
  assert.match(html, /id="part-processId"[^]*<option value="hand-drilling">Drilling by hand/);
  assert.match(html, /Cuts slots\. At least 8 mm of material beside each hole/);
  assert.match(html, /id="part-widthMm"[^>]*value="300"/);
  assert.match(html, /id="part-depthMm"[^>]*value="300"/);
  assert.match(html, /<option value="z" selected>Front to back \(Z\)<\/option>/);
  assert.doesNotMatch(html, /id="part-depthAxis"[^]*<option value="y"/);
  assert.match(html, /<option value="\+y" selected>Top \(\+Y\)<\/option>/);
  assert.doesNotMatch(html, /Front end \(\+Z\)/, 'a plate rests on a side, never on an end');
  assert.match(html, /id="part-alongMm"[^>]*value="500"/);
  assert.match(html, /id="part-acrossMm"[^>]*value="0"/);
  assert.doesNotMatch(html, /id="part-lengthMm"/);
});

test('a plate drilled by hand says it cuts no slots and what its holes need', async () => {
  const { editPlate } = await import('../../../src/cockpit/cad/history/plates.ts');
  const history = editPlate(plateHistory(), 'part-2', { processId: 'hand-drilling' });
  const html = partInspectorHTML(history, history[1]);
  assert.match(html, /<option value="hand-drilling" selected>/);
  assert.match(
    html,
    /Cuts no slots\. 1\.5 diameters from the edge to a hole’s center, 3 between centers/,
  );
});

test('the plate panel edits the new plate before it is added', () => {
  const history = railHistory();
  const html = platePanelHTML(history, draftPlate(history, 'part-1'));
  assert.match(html, /on <strong>Rail<\/strong>/);
  assert.match(html, /id="plate-widthMm"[^>]*value="300"/);
  assert.match(html, /id="confirmPlate"/);
  assert.match(html, /id="cancelPlate"/);
});
