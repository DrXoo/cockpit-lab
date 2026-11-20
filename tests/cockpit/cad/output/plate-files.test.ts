import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { plateFileName } from '../../../../src/cockpit/cad/output/plate-files.ts';
import { referencePlate } from '../../../support/designs.ts';
import { ofKind } from '../../../support/lookups.ts';

const plateIn = (history: readonly Operation[]) =>
  ofKind(replayDesign(history).resolved.get('part-2')?.part, 'plate');

test("a plate's files are named after the plate, its sheet with its thickness, and its process", () => {
  const plate = plateIn(referencePlate({ processId: 'hand-drilling' }));
  assert.equal(
    plateFileName(plate, 'dxf'),
    'Reference plate - Aluminium sheet, 5 mm - Drilling by hand.dxf',
  );
  assert.equal(
    plateFileName(plate, 'svg'),
    'Reference plate - Aluminium sheet, 5 mm - Drilling by hand.svg',
  );
});

test('characters a file name cannot hold become dashes', () => {
  const plate = plateIn(referencePlate({ name: 'Seat: A/B?' }));
  assert.match(plateFileName(plate, 'dxf'), /^Seat- A-B- - Aluminium sheet/);
});
