import test from 'node:test';
import assert from 'node:assert/strict';
import { layerViolations } from '../../scripts/check-layers.ts';

const check = (files: Record<string, string>) => layerViolations(new Map(Object.entries(files)));

test('a domain module that imports its editor, its drawing or the page is reported', () => {
  assert.deepEqual(
    check({
      'src/room/actions.ts': "import { roomItem } from './editing/room-editor.ts';\n",
      'src/cockpit/cad/history/replay.ts': [
        "import type { Primitive } from '../../render/cad.ts';",
        "import { el } from '../../../ui/dom.ts';",
        '',
      ].join('\n'),
      'src/project/project.ts': "export { notice } from '../app/notices.ts';\n",
    }),
    [
      'src/room/actions.ts:1 imports ./editing/room-editor.ts: the domain must not depend on editing/',
      'src/cockpit/cad/history/replay.ts:1 imports ../../render/cad.ts: the domain must not depend on render/',
      'src/cockpit/cad/history/replay.ts:2 imports ../../../ui/dom.ts: the domain must not depend on ui/',
      'src/project/project.ts:1 imports ../app/notices.ts: the domain must not depend on app/',
    ],
  );
});

test('an import over several lines is reported on the line of its path', () => {
  assert.deepEqual(
    check({
      'src/room/actions.ts': [
        'import {',
        '  isFeature,',
        '  roomItem,',
        "} from './editing/room-editor.ts';",
        '',
      ].join('\n'),
    }),
    [
      'src/room/actions.ts:4 imports ./editing/room-editor.ts: the domain must not depend on editing/',
    ],
  );
});

test('editors and drawings may use their domain, and the domain may use shared modules', () => {
  assert.deepEqual(
    check({
      'src/room/editing/room-editor.ts': "import { roomItem } from '../items.ts';\n",
      'src/cockpit/render/cad.ts': "import { assemble } from '../cad/parts/assembly.ts';\n",
      'src/room/room.ts': "import { round } from '../shared/geometry.ts';\n",
      'src/workbench.ts': "import { roomControls } from './room/editing/room-editor.ts';\n",
    }),
    [],
  );
});

test('shared modules depend on nothing outside shared/', () => {
  assert.deepEqual(
    check({ 'src/shared/checks.ts': "import type { RoomConfig } from '../room/config.ts';\n" }),
    ['src/shared/checks.ts:1 imports ../room/config.ts: shared/ must not depend on room/'],
  );
});

test('only the scene imports Three.js', () => {
  assert.deepEqual(
    check({
      'src/scene/three-adapter.ts': "import * as THREE from 'three';\n",
      'src/cockpit/render/cad.ts': "import { Mesh } from 'three';\n",
    }),
    ['src/cockpit/render/cad.ts:1 imports three: only scene/ may depend on Three.js'],
  );
});
