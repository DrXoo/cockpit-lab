import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign } from '../../../src/cockpit/cad/history/history.ts';
import type { Mode } from '../../../src/cockpit/cad/history/modes.ts';
import { appliedSubassemblies } from '../../../src/cockpit/cad/history/subassemblies.ts';
import { modesPanelHTML } from '../../../src/cockpit/editor/modes-view.ts';
import { subassemblyHTML } from '../../../src/cockpit/editor/subassembly-view.ts';
import { deckHistory } from '../../support/designs.ts';

/** The Deck (part-2) with the Wheel plate nested in it (part-3). */
const applied = () =>
  appliedSubassemblies(
    [
      { name: 'Wheel plate', rootId: 'part-3' },
      { name: 'Deck', rootId: 'part-2' },
    ],
    replayDesign(deckHistory()).resolved,
  );

const MODES: Mode[] = [
  { id: 'mode-1', name: 'Racing', takenOff: [] },
  { id: 'mode-2', name: 'Flight', takenOff: ['part-2'] },
];

test('without modes the panel offers to add one', () => {
  const html = modesPanelHTML(applied(), []);
  assert.match(html, /id="noModes"/);
  assert.match(html, /id="addMode"/);
  assert.doesNotMatch(html, /<table/);
});

test('each subassembly has a row, after the one holding it and indented', () => {
  const rows = [...modesPanelHTML(applied(), MODES).matchAll(/data-subassembly="([^"]+)"/g)];
  assert.deepEqual(
    rows.map((row) => row[1]),
    ['part-2', 'part-3'],
  );
  assert.match(modesPanelHTML(applied(), MODES), /padding-left: 14px">Wheel plate/);
});

test('each mode is a column that can be renamed and deleted', () => {
  const html = modesPanelHTML(applied(), MODES);
  assert.match(html, /data-mode-name="mode-2" value="Flight"/);
  assert.match(html, /data-delete-mode="mode-1"/);
});

test('a cell says in words whether its subassembly is on, and one off with its parent is locked', () => {
  const cell = (modeId: string, rootId: string) => {
    const html = modesPanelHTML(applied(), MODES);
    const found = html.match(
      new RegExp(
        `<input type="checkbox" data-mode="${modeId}" data-root="${rootId}"[^>]*><span>([^<]+)`,
      ),
    );
    assert.ok(found, `no cell for ${rootId} in ${modeId}`);
    return found[0];
  };
  assert.match(cell('mode-1', 'part-2'), /checked><span>On/);
  assert.match(cell('mode-2', 'part-2'), /"><span>Off$/);
  assert.match(cell('mode-2', 'part-3'), /disabled><span>Off/);
});

test('a part the mode shown takes off says so in its inspector', () => {
  const off = { mode: 'Flight', subassembly: 'Deck' };
  const html = subassemblyHTML(applied(), 'part-4', off);
  assert.match(html, /id="partOffInMode"/);
  assert.match(html, /Off in <strong>Flight<\/strong>, with <strong>Deck<\/strong>/);
  assert.doesNotMatch(subassemblyHTML(applied(), 'part-4'), /partOffInMode/);
});
