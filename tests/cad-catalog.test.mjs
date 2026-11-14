import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MOTEDIS_SERIES_40_SLOT_8,
  connectorType,
  connectorFits,
  fastenersOf,
  profileSection,
} from '../src/cad/catalog.ts';

test('the first profile system is Motedis series 40, I-type, slot 8', () => {
  const system = MOTEDIS_SERIES_40_SLOT_8;
  assert.equal(system.supplier, 'Motedis');
  assert.equal(system.series, 40);
  assert.equal(system.slotType, 'I');
  assert.equal(system.slotWidthMm, 8);
  assert.deepEqual(
    system.sections.map((section) => [section.id, section.widthMm, section.heightMm]),
    [
      ['40x40', 40, 40],
      ['40x80', 40, 80],
      ['40x120', 40, 120],
    ],
  );
});

test('every catalog section says where its dimensions come from', () => {
  for (const section of MOTEDIS_SERIES_40_SLOT_8.sections) {
    assert.equal(section.source.kind, 'data sheet', section.id);
    assert.match(section.source.reference, /^https:\/\/www\.motedis\./, section.id);
  }
});

test('a section is found by system and id, and an unknown one is an error', () => {
  assert.equal(profileSection(MOTEDIS_SERIES_40_SLOT_8, '40x80').heightMm, 80);
  assert.throws(() => profileSection(MOTEDIS_SERIES_40_SLOT_8, '45x45'), /45x45/);
});

test('the 40 corner bracket fits the series 40 slot 8 system', () => {
  const bracket = connectorType('corner-bracket-40');
  assert.ok(connectorFits(bracket, MOTEDIS_SERIES_40_SLOT_8));
  assert.ok(!connectorFits(bracket, { ...MOTEDIS_SERIES_40_SLOT_8, id: 'other-system' }));
  assert.throws(() => connectorType('angle-45'), /angle-45/);
});

test('a corner bracket needs two M8 bolts and T-nuts per leg', () => {
  assert.deepEqual(fastenersOf(connectorType('corner-bracket-40')), [
    { id: 'bolt-m8', quantity: 4 },
    { id: 't-nut-slot-8-m8', quantity: 4 },
  ]);
});
