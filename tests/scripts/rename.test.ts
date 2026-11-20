import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renamedSources, type RenameRequest } from '../../scripts/rename.ts';

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    noEmit: true,
    module: 'ESNext',
    moduleResolution: 'bundler',
    allowImportingTsExtensions: true,
  },
  include: ['*.ts'],
});

/** A project in a new folder, with a tsconfig.json and the given files. */
function project(files: Record<string, string>): string {
  const folder = mkdtempSync(join(tmpdir(), 'cockpit-lab-rename-'));
  writeFileSync(join(folder, 'tsconfig.json'), TSCONFIG);
  for (const [name, text] of Object.entries(files)) writeFileSync(join(folder, name), text);
  return folder;
}

/** The renamed text of each changed file, by file name. */
function rename(
  folder: string,
  request: Omit<RenameRequest, 'configFile' | 'file'> & { file: string },
): Record<string, string> {
  const sources = renamedSources({
    ...request,
    configFile: join(folder, 'tsconfig.json'),
    file: join(folder, request.file),
  });
  const byName: Record<string, string> = {};
  for (const [file, text] of sources) byName[file.slice(folder.length + 1)] = text;
  return byName;
}

test('a rename reaches every use across files and leaves strings and comments alone', () => {
  // Text before the uses holds characters of two and four UTF-16 units, so the places the
  // compiler reports must be counted as JavaScript counts them.
  const header = '// A 200 × 150 mm plate, µm tolerances 🙂\n';
  const folder = project({
    'a.ts': [
      header + 'export const widthMm = 3; // widthMm of the plate',
      "export const label = 'widthMm: ' + widthMm + `${'widthMm'}`;",
      '',
    ].join('\n'),
    'b.ts': "import { widthMm } from './a.ts';\nexport const twice = widthMm * 2;\n",
  });

  const sources = rename(folder, { file: 'a.ts', oldName: 'widthMm', newName: 'plateWidthMm' });

  assert.deepEqual(sources, {
    'a.ts': [
      header + 'export const plateWidthMm = 3; // widthMm of the plate',
      "export const label = 'widthMm: ' + plateWidthMm + `${'widthMm'}`;",
      '',
    ].join('\n'),
    'b.ts': "import { plateWidthMm } from './a.ts';\nexport const twice = plateWidthMm * 2;\n",
  });
});

test('renaming a variable keeps the property it fills in shorthand', () => {
  const folder = project({
    'a.ts': 'const width = 3;\nexport const box = { width };\n',
  });

  const sources = rename(folder, { file: 'a.ts', oldName: 'width', newName: 'widthMm' });

  assert.deepEqual(sources, {
    'a.ts': 'const widthMm = 3;\nexport const box = { width: widthMm };\n',
  });
});

test('renaming a property keeps the variables that shorthand ties to it', () => {
  const folder = project({
    'a.ts': [
      'interface Box { width: number }',
      'const width = 3;',
      'const box: Box = { width };',
      'const { width: alias } = box;',
      'export function area({ width }: Box): number { return width * alias; }',
      '',
    ].join('\n'),
  });

  const sources = rename(folder, {
    file: 'a.ts',
    line: 1,
    oldName: 'width',
    newName: 'widthMm',
  });

  assert.deepEqual(sources, {
    'a.ts': [
      'interface Box { widthMm: number }',
      'const width = 3;',
      'const box: Box = { widthMm: width };',
      'const { widthMm: alias } = box;',
      'export function area({ widthMm: width }: Box): number { return width * alias; }',
      '',
    ].join('\n'),
  });
});

test('a name with two meanings in the file needs the line of the one to rename', () => {
  const folder = project({
    'a.ts': [
      'export function first(size: number) { return size; }',
      'export function second(size: number) { return size * 2; }',
      '',
    ].join('\n'),
  });

  assert.throws(
    () => rename(folder, { file: 'a.ts', oldName: 'size', newName: 'sizeMm' }),
    /2 different symbols.*lines 1, 2/,
  );
  assert.deepEqual(rename(folder, { file: 'a.ts', line: 2, oldName: 'size', newName: 'sizeMm' }), {
    'a.ts': [
      'export function first(size: number) { return size; }',
      'export function second(sizeMm: number) { return sizeMm * 2; }',
      '',
    ].join('\n'),
  });
});

test('a name that is not in the file or a new name that is no identifier is refused', () => {
  const folder = project({ 'a.ts': "export const label = 'width';\n" });

  assert.throws(
    () => rename(folder, { file: 'a.ts', oldName: 'width', newName: 'widthMm' }),
    /No identifier width/,
  );
  assert.throws(
    () => rename(folder, { file: 'a.ts', oldName: 'label', newName: 'new label' }),
    /not an identifier/,
  );
});
