import test from 'node:test';
import assert from 'node:assert/strict';
import {
  unitFor,
  controlValue,
  rangeHTML,
  toggleHTML,
  selectHTML,
  groupHTML,
} from '../src/controls-view.ts';
import { defaults, evaluate, fieldSpec, wrapAngle } from '../src/model.ts';

const state = { ...defaults, baseLift: 12, wheel: true, monitorMode: 'manual' };
const view = { state, evaluation: evaluate(state) };

test('each setting shows its unit', () => {
  assert.equal(unitFor('monitorInches'), '″');
  assert.equal(unitFor('armSplit'), '%');
  assert.equal(unitFor('recline'), '°');
  assert.equal(unitFor('deskAngle'), '°');
  assert.equal(unitFor('length'), 'cm');
});

test('rig heights are shown from the floor, including the base elevation', () => {
  assert.equal(controlValue(view, 'seatH'), state.seatH + 12);
  assert.equal(controlValue(view, 'length'), state.length);
});

test('arm angles are shown as the evaluated pose, the screen yaw relative to the desk', () => {
  const { armPose, monitorAngle } = view.evaluation;
  assert.equal(controlValue(view, 'armBaseAngle'), armPose.baseAngle);
  assert.equal(controlValue(view, 'armElbowAngle'), armPose.elbowAngle);
  assert.equal(controlValue(view, 'monitorYaw'), wrapAngle(monitorAngle - state.deskAngle));
});

test('a range control has a slider and a number field with the current limits', () => {
  const html = rangeHTML(view, 'seatH', 'Altura del cojín');
  const [min, max, step] = fieldSpec('seatH', state);
  assert.match(
    html,
    new RegExp(
      `id="seatH-range" type="range" data-key="seatH" min="${min}" max="${max}" step="${step}" value="${state.seatH + 12}"`,
    ),
  );
  assert.match(html, /id="seatH-number" type="number"/);
  assert.match(html, /aria-label="Altura del cojín, valor en cm"/);
  assert.match(html, /<span>cm<\/span>/);
});

test('toggles and selects reflect the current value', () => {
  assert.match(toggleHTML(view, 'wheel', 'Volante'), /data-key="wheel" checked/);
  assert.doesNotMatch(toggleHTML(view, 'hotas', 'HOTAS'), /checked/);
  const html = selectHTML(view, 'feet', 'Apoyo', [
    ['level', 'Pies'],
    ['casters', 'Ruedas'],
  ]);
  assert.match(html, /<option value="level" selected>Pies<\/option>/);
  assert.match(html, /<option value="casters" >Ruedas<\/option>/);
});

test('a group has a title and an optional hint', () => {
  assert.equal(
    groupHTML('Base', 'x'),
    '<div class="control-group"><h3 class="group-title">Base</h3>x</div>',
  );
  assert.match(groupHTML('Base', 'x', '40 × 80'), /<span>40 × 80<\/span>/);
});
