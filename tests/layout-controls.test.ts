import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, sanitize, evaluate } from '../src/model.ts';
import { roomControls } from '../src/room-editor.ts';
import { canAddRoomItem } from '../src/room-actions.ts';
import {
  createLayoutLibrary,
  duplicateLayout,
  hideFurniture,
  hiddenFurnitureOf,
  renameLayout,
} from '../src/layouts.ts';
import { layoutOptionsHTML } from '../src/layouts-view.ts';

const bed = { id: 'bed', type: 'bed', name: 'Cama <grande>', x: 100, z: 100, width: 140 };
const config = sanitize({ ...defaults, roomFurniture: [bed] });
const range = (key) => `<range ${key}>`;
const toggle = (key) => `<toggle ${key}>`;
const furnitureControls = (target, options) =>
  roomControls(config, evaluate(config), target, range, toggle, {
    mode: 'furniture',
    ...options,
  });

test('the layout picker lists every layout, marks the active one and escapes names', () => {
  let library = duplicateLayout(createLayoutLibrary(config), 'Junto a la "ventana"');
  library = renameLayout(library, 'layout-1', 'Base & más');
  assert.equal(
    layoutOptionsHTML(library),
    '<option value="layout-1">Base &amp; más</option>' +
      '<option value="layout-2" selected>Junto a la &quot;ventana&quot;</option>',
  );
});

test('the active layout lists the furniture it hides, by name', () => {
  const library = hideFurniture(createLayoutLibrary(config), 'bed');
  assert.deepEqual(hiddenFurnitureOf(library), [{ id: 'bed', name: 'Cama grande' }]);
  assert.deepEqual(hiddenFurnitureOf(createLayoutLibrary(config)), []);
});

test('hidden furniture still counts toward the furniture limit', () => {
  const many = sanitize({
    ...defaults,
    roomFurniture: Array.from({ length: 29 }, (_, i) => ({ ...bed, id: `item-${i}` })),
  });
  assert.equal(canAddRoomItem(many, 'bed'), true);
  assert.equal(canAddRoomItem(many, 'bed', { hiddenFurniture: 1 }), false);
  assert.equal(canAddRoomItem(many, 'door', { hiddenFurniture: 1 }), true);
});

test('selected furniture can be hidden in the layout, and deleting says it affects all', () => {
  const html = furnitureControls('furniture:bed', { hiddenFurniture: [], layoutCount: 2 });
  assert.match(html, /<button class="room-hide" id="roomHide">Hide in this layout<\/button>/);
  assert.match(html, /id="roomDelete">Delete from every layout</);
});

test('with a single layout, deleting keeps its plain label', () => {
  const html = furnitureControls('furniture:bed', { hiddenFurniture: [], layoutCount: 1 });
  assert.match(html, /id="roomHide"/);
  assert.match(html, /id="roomDelete">Delete this item</);
});

test('the guided setup offers no hiding, since it edits the only layout', () => {
  assert.doesNotMatch(furnitureControls('furniture:bed', {}), /roomHide/);
});

test('hidden furniture is listed with a button to show it again', () => {
  const html = furnitureControls('desk', {
    hiddenFurniture: [{ id: 'sofa', name: 'Sofá <cama>' }],
    layoutCount: 2,
  });
  assert.match(html, /Hidden in this layout/);
  assert.match(html, /<button data-show-furniture="sofa">Show Sofá &lt;cama&gt;<\/button>/);
});
