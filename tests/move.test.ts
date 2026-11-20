import test from 'node:test';
import assert from 'node:assert/strict';
import { movedFiles } from '../scripts/move.ts';

/** The files a move changes, as an object for comparison. */
function move(
  files: Record<string, string>,
  moves: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    movedFiles(new Map(Object.entries(files)), new Map(Object.entries(moves))),
  );
}

test('the files that point at a moved module point at its new place', () => {
  const files = {
    'src/units.ts': 'export const MM_PER_CM = 10;\n',
    'src/app.ts': "import { MM_PER_CM } from './units.ts';\n",
    'src/cad/plate.ts': "import { MM_PER_CM } from '../units.ts';\n",
    'tests/units.test.ts': [
      "import { MM_PER_CM } from '../src/units.ts';",
      "const later = await import('../src/units.ts');",
      "const source = new URL('../src/units.ts', import.meta.url);",
      '',
    ].join('\n'),
  };

  assert.deepEqual(move(files, { 'src/units.ts': 'src/shared/units.ts' }), {
    'src/shared/units.ts': 'export const MM_PER_CM = 10;\n',
    'src/app.ts': "import { MM_PER_CM } from './shared/units.ts';\n",
    'src/cad/plate.ts': "import { MM_PER_CM } from '../shared/units.ts';\n",
    'tests/units.test.ts': [
      "import { MM_PER_CM } from '../src/shared/units.ts';",
      "const later = await import('../src/shared/units.ts');",
      "const source = new URL('../src/shared/units.ts', import.meta.url);",
      '',
    ].join('\n'),
  });
});

test('a moved module keeps pointing at the files it imports, moved with it or not', () => {
  const files = {
    'src/geometry.ts': 'export const ORIGIN = 0;\n',
    'src/room.ts': "import { ORIGIN } from './geometry.ts';\nimport { DESK } from './desk.ts';\n",
    'src/desk.ts': "import { ROOM } from './room.ts';\nexport const DESK = ROOM;\n",
  };

  assert.deepEqual(
    move(files, { 'src/room.ts': 'src/room/room.ts', 'src/desk.ts': 'src/room/desk.ts' }),
    {
      'src/room/room.ts':
        "import { ORIGIN } from '../geometry.ts';\nimport { DESK } from './desk.ts';\n",
      'src/room/desk.ts': "import { ROOM } from './room.ts';\nexport const DESK = ROOM;\n",
    },
  );
});

test('text that names no file of the repository is left as it is', () => {
  const files = {
    'src/units.ts': '',
    'tests/rename.test.ts': [
      'const fixture = "import { widthMm } from \'./a.ts\';";',
      'const file = new URL(`./fixtures/${name}`, import.meta.url);',
      "const root = new URL('../', import.meta.url);",
      '',
    ].join('\n'),
  };

  assert.deepEqual(move(files, { 'tests/rename.test.ts': 'tests/tools/rename.test.ts' }), {
    'tests/tools/rename.test.ts': files['tests/rename.test.ts'],
  });
});

test('the page and its styles follow the modules and style sheets they load', () => {
  const files = {
    'src/index.html':
      '<link rel="stylesheet" href="./theme.css" />\n<script src="./app.ts"></script>\n',
    'src/theme.css': ':root {}\n',
    'src/app.ts': '',
  };

  assert.deepEqual(move(files, { 'src/theme.css': 'src/styles/theme.css' }), {
    'src/styles/theme.css': ':root {}\n',
    'src/index.html':
      '<link rel="stylesheet" href="./styles/theme.css" />\n<script src="./app.ts"></script>\n',
  });
});

test('documents follow the paths they name from the root and the links they hold', () => {
  const files = {
    'src/units.ts': '',
    'src/cad/units.ts': '',
    'AGENTS.md': 'Use `src/units.ts`, not src/units.tsx or `src/cad/units.ts`.\n',
    'docs/development.md': 'See [units](../src/units.ts#L3) and (src/units.ts).\n',
    'scripts/casts-baseline.json': '{\n  "src/units.ts": 2\n}\n',
  };

  assert.deepEqual(move(files, { 'src/units.ts': 'src/shared/units.ts' }), {
    'src/shared/units.ts': '',
    'AGENTS.md': 'Use `src/shared/units.ts`, not src/units.tsx or `src/cad/units.ts`.\n',
    'docs/development.md': 'See [units](../src/shared/units.ts#L3) and (src/shared/units.ts).\n',
    'scripts/casts-baseline.json': '{\n  "src/shared/units.ts": 2\n}\n',
  });
});

test('a move from a file that is not there, or onto one that is, is refused', () => {
  const files = { 'src/units.ts': '', 'src/geometry.ts': '' };

  assert.throws(
    () => move(files, { 'src/missing.ts': 'src/shared/missing.ts' }),
    /no file src\/missing\.ts/,
  );
  assert.throws(
    () => move(files, { 'src/units.ts': 'src/geometry.ts' }),
    /src\/geometry\.ts is taken/,
  );
  assert.throws(
    () => move(files, { 'src/units.ts': 'src/shared/a.ts', 'src/geometry.ts': 'src/shared/a.ts' }),
    /src\/shared\/a\.ts is taken/,
  );
});
