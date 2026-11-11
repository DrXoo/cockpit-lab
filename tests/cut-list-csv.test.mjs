import test from 'node:test';
import assert from 'node:assert/strict';
import { cutListCsv } from '../src/cut-list-csv.ts';
import { defaults, evaluate } from '../src/model.ts';

const evaluation = {
  parts: [{ name: 'Side rail "base"', profile: '40x40', qty: 2, mm: 1250, total: 2500 }],
  accessories: [{ name: 'Bracket', qty: 8, note: '40 series' }],
};

test('The cut list CSV starts with a BOM and uses semicolons and CRLF', () => {
  const csv = cutListCsv(evaluation);
  assert.equal(csv[0], '﻿');
  assert.equal(
    csv.slice(1),
    [
      '"Part";"Profile (mm)";"Quantity";"Net length (mm)";"Total length (mm)";"Detail"',
      '"Side rail ""base""";"40x40";"2";"1250";"2500";"Check before building"',
      '',
      '"Parts and fasteners";"";"Quantity";"";"";"Detail"',
      '"Bracket";"";"8";"";"";"40 series"',
    ].join('\r\n'),
  );
});

test('The cut list CSV has one row per part and accessory of the evaluated model', () => {
  const result = evaluate(defaults);
  const lines = cutListCsv(result).split('\r\n');
  assert.equal(lines.length, 3 + result.parts.length + result.accessories.length);
});
