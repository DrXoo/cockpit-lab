import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PROCESS_ID,
  fabricationProcess,
  fabricationProcesses,
  leastEdgeMarginMm,
  leastGapBetweenHolesMm,
} from '../../../../src/cockpit/cad/parts/fabrication.ts';

test('plates are laser cut or drilled by hand, laser cutting unless chosen, all estimated', () => {
  assert.deepEqual(
    fabricationProcesses().map((process) => [process.id, process.cutsSlots]),
    [
      ['laser-cutting', true],
      ['hand-drilling', false],
    ],
  );
  assert.equal(DEFAULT_PROCESS_ID, 'laser-cutting');
  for (const process of fabricationProcesses())
    assert.equal(process.source.kind, 'estimated', process.id);
  assert.throws(() => fabricationProcess('plasma'), /plasma is not in the catalog/);
});

test('a laser cut plate keeps a sheet thickness of material around each hole', () => {
  const laser = fabricationProcess('laser-cutting');
  assert.equal(leastEdgeMarginMm(laser, { thicknessMm: 8, diameterMm: 9 }), 8);
  assert.equal(leastGapBetweenHolesMm(laser, { thicknessMm: 5, diameterMm: 9 }), 5);
});

test('a hole drilled by hand keeps 1.5 diameters from its center to the edge, 3 to the next center', () => {
  const drilled = fabricationProcess('hand-drilling');
  // Material between the hole and the edge: 1.5 diameters to its center less its radius.
  assert.equal(leastEdgeMarginMm(drilled, { thicknessMm: 8, diameterMm: 10 }), 10);
  // Material between two holes of 10 mm, 30 mm apart center to center.
  assert.equal(leastGapBetweenHolesMm(drilled, { thicknessMm: 8, diameterMm: 10 }), 20);
});
