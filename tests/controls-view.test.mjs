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

const state = { ...defaults, monitorEnabled: true, keyboardEnabled: false, monitorMode: 'manual' };
const view = { state, evaluation: evaluate(state) };

test('each setting shows its unit', () => {
  assert.equal(unitFor('monitorInches'), '″');
  assert.equal(unitFor('armSplit'), '%');
  assert.equal(unitFor('monitorYaw'), '°');
  assert.equal(unitFor('deskAngle'), '°');
  assert.equal(unitFor('deskH'), 'cm');
});

test('a setting outside the arm is shown as it is', () => {
  assert.equal(controlValue(view, 'deskH'), state.deskH);
});

test('arm angles are shown as the evaluated pose, the screen yaw relative to the desk', () => {
  const { armPose, monitorAngle } = view.evaluation;
  assert.equal(controlValue(view, 'armBaseAngle'), armPose.baseAngle);
  assert.equal(controlValue(view, 'armElbowAngle'), armPose.elbowAngle);
  assert.equal(controlValue(view, 'monitorYaw'), wrapAngle(monitorAngle - state.deskAngle));
});

test('a range control has a slider and a number field with the current limits', () => {
  const html = rangeHTML(view, 'deskH', 'Desktop height');
  const [min, max, step] = fieldSpec('deskH', state);
  assert.match(
    html,
    new RegExp(
      `id="deskH-range" type="range" data-key="deskH" min="${min}" max="${max}" step="${step}" value="${state.deskH}"`,
    ),
  );
  assert.match(html, /id="deskH-number" type="number"/);
  assert.match(html, /aria-label="Desktop height, value in cm"/);
  assert.match(html, /<span>cm<\/span>/);
});

test('toggles and selects reflect the current value', () => {
  assert.match(toggleHTML(view, 'monitorEnabled', 'Monitor'), /data-key="monitorEnabled" checked/);
  assert.doesNotMatch(toggleHTML(view, 'keyboardEnabled', 'Keyboard'), /checked/);
  const html = selectHTML(view, 'clampMount', 'Mount', [
    ['clamp', 'Clamp'],
    ['grommet', 'Grommet'],
  ]);
  assert.match(html, /<option value="clamp" selected>Clamp<\/option>/);
  assert.match(html, /<option value="grommet" >Grommet<\/option>/);
});

test('a group has a title and an optional hint', () => {
  assert.equal(
    groupHTML('Base', 'x'),
    '<div class="control-group"><h3 class="group-title">Base</h3>x</div>',
  );
  assert.match(groupHTML('Base', 'x', '40 × 80'), /<span>40 × 80<\/span>/);
});
