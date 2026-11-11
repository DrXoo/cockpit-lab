import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { drawRig } from '../src/render-rig.ts';
import { defaults, evaluate, drivingMount } from '../src/model.ts';
import { degToRad } from '../src/geometry.ts';

const draw = (changes = {}, options = { person: false }) => {
  const state = { ...defaults, ...changes };
  const r = createRenderList();
  drawRig(r, ROOT, state, evaluate(state), options);
  return { state, primitives: r.primitives };
};
const ofKind = (primitives, kind) => primitives.filter((p) => p.kind === kind);

test('without a cockpit no rig is drawn', () => {
  assert.deepEqual(draw({ cockpitEnabled: false }).primitives, []);
});

test('level feet are rubber pads under the four corners of the base', () => {
  const { state, primitives } = draw({ feet: 'level' });
  const pads = ofKind(primitives, 'cylinder').filter((p) => p.radius === 3.6);
  const corners = pads.map((p) => [p.position[0], p.position[2]]);
  const x = state.width / 2 - 2;
  assert.deepEqual(corners, [
    [-x, 10],
    [-x, state.length - 10],
    [x, 10],
    [x, state.length - 10],
  ]);
  assert.ok(pads.every((p) => p.material === 'rubber' && p.parent === ROOT));
});

test('casters are wheels turned on their side', () => {
  const wheels = ofKind(draw({ feet: 'casters' }).primitives, 'cylinder').filter(
    (p) => p.radius === 3.3,
  );
  assert.equal(wheels.length, 4);
  assert.ok(wheels.every((p) => p.rotation[2] === Math.PI / 2));
});

test('the frame stands on the base, lifted by the base lift', () => {
  const { primitives } = draw({ baseLift: 12 });
  const [assembly] = ofKind(primitives, 'group');
  assert.deepEqual(assembly.position, [0, 12, 0]);
  assert.equal(assembly.parent, ROOT);
});

test('two 40 × 80 rails run along the whole rig', () => {
  const { state, primitives } = draw();
  const rails = ofKind(primitives, 'box').filter(
    (p) => p.size[2] === state.length && p.size[1] === 8,
  );
  assert.deepEqual(
    rails.map((p) => p.position[0]),
    [-(state.width / 2 - 2), state.width / 2 - 2],
  );
  assert.ok(rails.every((p) => p.edges && p.material === 'silver'));
});

test('the pedal deck tilts towards the driver', () => {
  const { state, primitives } = draw({ pedalTilt: 20 });
  const deck = ofKind(primitives, 'group').find(
    (g) => g.position[1] === state.pedalH && g.position[2] === state.pedalZ,
  );
  assert.deepEqual(deck.rotation, [-degToRad(20), 0, 0]);
});

test('the wheel rim is only drawn with a wheel', () => {
  assert.equal(ofKind(draw({ wheel: true }).primitives, 'torus').length, 1);
  assert.equal(ofKind(draw({ wheel: false }).primitives, 'torus').length, 0);
});

test('the shifter plate sits on the driving side', () => {
  for (const drivingSide of ['left', 'right']) {
    const { state, primitives } = draw({ shifter: true, drivingSide });
    const plate = ofKind(primitives, 'box').find(
      (p) => p.size[0] === 20 && p.size[1] === 1 && p.size[2] === 30,
    );
    assert.equal(plate.position[0], drivingMount(state).x);
  }
});

test('the seated person is only drawn when asked for', () => {
  const blue = (primitives) => primitives.filter((p) => p.material === 'blue').length;
  assert.equal(blue(draw().primitives), 0);
  assert.ok(blue(draw({}, { person: true }).primitives) > 0);
});
