import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../src/cockpit/cad/history/history.ts';
import {
  appliedSubassemblies,
  type Subassembly,
} from '../../../src/cockpit/cad/history/subassemblies.ts';
import { subassemblyHTML } from '../../../src/cockpit/editor/subassembly-view.ts';
import { partInspectorHTML } from '../../../src/cockpit/editor/inspector-view.ts';
import { railHistory, withGrowth, withPlate } from '../../support/designs.ts';

/** The rail (part-1), a Deck grown out of it (part-2) and a plate on the deck (part-3). */
const deckHistory = (): Operation[] =>
  withPlate(withGrowth(railHistory(), 'part-1', { name: 'Deck', face: '+y' }), 'part-2', {
    face: '+z',
  });

const applied = (subassemblies: readonly Subassembly[]) =>
  appliedSubassemblies(subassemblies, replayDesign(deckHistory()).resolved);

test('a part in no subassembly can be made the root of one', () => {
  const html = subassemblyHTML(applied([]), 'part-2');
  assert.match(html, /id="makeSubassembly"/);
  assert.match(html, /In no subassembly/);
  assert.doesNotMatch(html, /id="ungroupSubassembly"/);
});

test("a root's inspector names its subassembly, what it holds and ungroups it", () => {
  const html = subassemblyHTML(applied([{ name: 'Wheel deck', rootId: 'part-2' }]), 'part-2');
  assert.match(html, /id="subassemblyName" value="Wheel deck"/);
  assert.match(html, /the 1 part hanging from it/);
  assert.match(html, /id="ungroupSubassembly"/);
  assert.doesNotMatch(html, /id="makeSubassembly"/);
});

test('a part inside names its innermost subassembly, and can root a nested one', () => {
  const html = subassemblyHTML(applied([{ name: 'Wheel deck', rootId: 'part-2' }]), 'part-3');
  assert.match(html, /In <strong>Wheel deck<\/strong>/);
  assert.match(html, /id="makeSubassembly"/);
});

test("a nested root's inspector says which subassembly it is inside", () => {
  const nested = applied([
    { name: 'Frame', rootId: 'part-1' },
    { name: 'Wheel deck', rootId: 'part-2' },
  ]);
  assert.match(subassemblyHTML(nested, 'part-2'), /It is inside <strong>Frame<\/strong>/);
});

test("the inspector of a part shows its subassembly, but not a failed step's", () => {
  const history = deckHistory();
  const subassemblies = applied([{ name: 'Wheel deck', rootId: 'part-2' }]);
  const shown = partInspectorHTML(history, history[1], undefined, [], [], { subassemblies });
  assert.match(shown, /id="subassemblyName"/);
  const failed = partInspectorHTML(history, history[1], 'It no longer fits.', [], [], {
    subassemblies,
  });
  assert.doesNotMatch(failed, /Subassembly/);
  const fitting = partInspectorHTML(history, history[1], undefined, [], [], {
    fitting: true,
    subassemblies,
  });
  assert.match(fitting, /id="subassemblyName"/);
});
