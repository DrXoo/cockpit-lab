import test from 'node:test';
import assert from 'node:assert/strict';
import { cutListCsv } from '../src/cut-list-csv.ts';
import { defaults, evaluate } from '../src/model.ts';

const evaluation = {
  parts: [{ name: 'Larguero "base"', profile: '40x40', qty: 2, mm: 1250, total: 2500 }],
  accessories: [{ name: 'Escuadra', qty: 8, note: 'Serie 40' }],
};

test('The cut list CSV starts with a BOM and uses semicolons and CRLF', () => {
  const csv = cutListCsv(evaluation);
  assert.equal(csv[0], '﻿');
  assert.equal(
    csv.slice(1),
    [
      '"Pieza";"Perfil (mm)";"Cantidad";"Longitud neta (mm)";"Longitud total (mm)";"Detalle"',
      '"Larguero ""base""";"40x40";"2";"1250";"2500";"Verificar antes de fabricar"',
      '',
      '"Piezas y fijaciones";"";"Cantidad";"";"";"Detalle"',
      '"Escuadra";"";"8";"";"";"Serie 40"',
    ].join('\r\n'),
  );
});

test('The cut list CSV has one row per part and accessory of the evaluated model', () => {
  const result = evaluate(defaults);
  const lines = cutListCsv(result).split('\r\n');
  assert.equal(lines.length, 3 + result.parts.length + result.accessories.length);
});
