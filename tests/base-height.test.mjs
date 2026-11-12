import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults,
  evaluate,
  getParts,
  sanitize,
  rigHeightKeys,
  rigLift,
  floorHeight,
  setRigHeight,
  fieldSpec,
  baseSupports,
} from '../src/model.ts';
import { readProject, projectData, completeSetup } from '../src/project.ts';
import { createLayoutLibrary, layoutConfig } from '../src/layouts.ts';
import { partialSummary } from '../src/project-summary.ts';

test('the lift keeps the posture and local settings and shows heights from the floor', () => {
  const s = { ...defaults, baseLift: 25, hotas: true, centerStick: true },
    before = evaluate({ ...s, baseLift: 0 }),
    after = evaluate(s);
  assert.deepEqual(after.body, before.body);
  for (const key of rigHeightKeys) {
    assert.equal(floorHeight(s, key), defaults[key] + 25);
    const [min, max, step] = fieldSpec(key, defaults);
    assert.deepEqual(fieldSpec(key, s), [min + 25, max + 25, step]);
    const edited = setRigHeight(s, key, floorHeight(s, key) + 3);
    assert.equal(edited[key], s[key] + 3);
    assert.equal(edited.baseLift, 25);
  }
  assert.deepEqual(after.rigPolygon, before.rigPolygon);
  assert.deepEqual(after.monitorPoint, before.monitorPoint);
  assert.equal(after.lift, before.lift);
  assert.equal(after.checks.find((c) => c.id === 'screen').value, '-18 cm');
  assert.notEqual(
    after.checks.find((c) => c.id === 'eyes').value,
    before.checks.find((c) => c.id === 'eyes').value,
  );
});

test('the four supports join the original floor to the chassis and set the added cuts', () => {
  for (const baseLift of [1, 25, 50]) {
    const s = { ...defaults, baseLift },
      supports = baseSupports(s),
      parts = getParts(s),
      original = getParts(defaults);
    assert.equal(supports.length, 4);
    for (const p of supports) {
      assert.equal(p.y - p.length / 2, 6);
      assert.equal(p.y + p.length / 2, 6 + baseLift);
    }
    assert.equal(parts.parts.find((p) => p.name === 'Base extensions').qty, supports.length);
    assert.equal(
      parts.totalMm - original.totalMm,
      supports.reduce((sum, p) => sum + p.length * 10, 0),
    );
    assert.equal(parts.cuts - original.cuts, 4);
  }
  assert.deepEqual(baseSupports(defaults), []);
  assert.deepEqual(baseSupports({ ...defaults, baseLift: 25, cockpitEnabled: false }), []);
});

test('interference with the desk is checked again at the real height', () => {
  const s = { ...defaults, deskX: 60, deskZ: 160, wheel: false, shifter: false, handbrake: false };
  assert.equal(evaluate(s).collisionCount, 0);
  assert.ok(evaluate({ ...s, baseLift: 50 }).collisionCount > 0);
});

test('older v1 and v2 JSON keep their height and new files store the lift', () => {
  const old = { ...defaults };
  delete old.baseLift;
  for (const version of [1, 2]) {
    const p = readProject({
      app: 'Cockpit Lab',
      version,
      units: 'cm',
      config: old,
      setup: completeSetup(),
    });
    assert.equal(rigLift(layoutConfig(p.library)), 0);
    assert.equal(floorHeight(layoutConfig(p.library), 'seatH'), old.seatH);
  }
  const s = { ...defaults, baseLift: 25 };
  const restored = readProject(
    JSON.parse(JSON.stringify(projectData(createLayoutLibrary(sanitize(s)), completeSetup()))),
  );
  assert.deepEqual(layoutConfig(restored.library), sanitize(s));
  assert.equal(sanitize({ baseLift: 999 }).baseLift, 50);
  assert.equal(sanitize({ baseLift: -5 }).baseLift, 0);
  assert.throws(() => sanitize({ baseLift: '25' }));
  assert.throws(() => sanitize({ baseLift: Infinity }));
  const html = partialSummary(s, evaluate(s), completeSetup());
  assert.ok(html.includes('Base lift'));
  assert.ok(html.includes('25 cm · chassis axis 35 cm above the floor'));
  assert.ok(html.includes('40 / 57 cm'));
  assert.ok(html.includes('118 / 43 cm'));
});
