import test from 'node:test';
import assert from 'node:assert/strict';
import { baselineProblems, unexplainedCasts } from '../scripts/check-casts.mjs';

test('a type assertion is found on its line', () => {
  assert.deepEqual(unexplainedCasts('const a = 1;\nconst b = value as Mm;\n'), [2]);
  assert.deepEqual(
    unexplainedCasts('const c = (data as unknown as Record<string, number>).x;'),
    [1, 1],
  );
  assert.deepEqual(unexplainedCasts("const d = { kind: 'x' as Kind };"), [1]);
});

test('as const, and as in comments, strings and template text, are not casts', () => {
  const source = [
    "const axes = ['x', 'y'] as const;",
    '// The plate rests as a peripheral does.',
    '/* as Foo */',
    "const label = 'measured as Mm';",
    'const text = `shown as Cm`;',
  ].join('\n');
  assert.deepEqual(unexplainedCasts(source), []);
});

test('the code inside a template literal is checked', () => {
  assert.deepEqual(unexplainedCasts('const t = `size ${value as Mm} mm`;'), [1]);
  assert.deepEqual(
    unexplainedCasts('const t = `a ${`b ${x as B}`} c`;\nconst u = y as U;'),
    [1, 2],
  );
});

test('the renames of imports and exports are not casts', () => {
  const source = [
    "import { a as b, type C as D } from './x.ts';",
    "import * as T from 'three';",
    'export {',
    '  e as f,',
    "} from './y.ts';",
  ].join('\n');
  assert.deepEqual(unexplainedCasts(source), []);
});

test('a Cast: comment on its line or the line above explains it', () => {
  assert.deepEqual(unexplainedCasts('const a = n as Mm; // Cast: a branded length'), []);
  assert.deepEqual(unexplainedCasts('// Cast: a branded length\nconst a = n as Mm;'), []);
  assert.deepEqual(unexplainedCasts('// a branded length\nconst a = n as Mm;'), [2]);
});

test('a file may keep the casts its baseline counts, never more, and lowers it as they go', () => {
  const baseline = { 'src/old.ts': 2 };
  assert.deepEqual(baselineProblems({ 'src/old.ts': [3, 9] }, baseline), []);
  assert.match(
    baselineProblems({ 'src/old.ts': [3, 9, 12] }, baseline)[0],
    /src\/old.ts: 3 .*3, 9, 12; 2 allowed/,
  );
  assert.match(
    baselineProblems({ 'src/new.ts': [5] }, baseline).join(),
    /src\/new.ts: 1 .*0 allowed/,
  );
  assert.match(baselineProblems({ 'src/old.ts': [3] }, baseline)[0], /lower it/);
  assert.match(baselineProblems({}, baseline)[0], /src\/old.ts: 0 .*lower it/);
});
