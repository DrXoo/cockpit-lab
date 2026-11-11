import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate, editArm } from '../src/model.js';
import { creationControls } from '../src/setup-editor.js';
import { monitorShortcuts } from '../src/desk-editor.js';

const controls = { range: () => '', toggle: () => '', select: () => '' };
const render = (state, target) =>
  creationControls(state, evaluate(state), { step: 'desk' }, target, controls);
const button = (html, mode) =>
  html.match(new RegExp(`<button[^>]*data-monitor-pose="${mode}"[^>]*>`))?.[0];

test('El paso Mesa conserva los dos destinos del monitor al seleccionar cualquier elemento', () => {
  const s = { ...defaults, monitorMode: 'manual' };
  for (const target of ['desk', 'arm', 'keyboard', 'pc', 'mouse', 'mat']) {
    const html = render(s, target);
    assert.ok(button(html, 'cockpit'), target);
    assert.ok(button(html, 'desk'), target);
    assert.equal((html.match(/data-monitor-pose=/g) || []).length, 2, target);
    assert.ok(!button(html, 'cockpit').includes('disabled'), target);
  }
});

test('El destino cockpit se habilita al añadirlo y los botones respetan la presencia del monitor', () => {
  const s = { ...defaults, cockpitEnabled: false, monitorMode: 'desk' };
  const html = render(s, 'keyboard');
  assert.ok(button(html, 'cockpit').includes('disabled'));
  assert.ok(!button(html, 'desk').includes('disabled'));
  assert.ok(html.includes('Añade un cockpit'));
  assert.ok(
    !button(render({ ...s, cockpitEnabled: true }, 'keyboard'), 'cockpit').includes('disabled'),
  );
  assert.equal(button(render({ ...s, monitorEnabled: false }, 'desk'), 'desk'), undefined);
  assert.equal(button(render({ ...s, deskEnabled: false }, 'desk'), 'desk'), undefined);
  assert.equal(monitorShortcuts({ ...s, monitorEnabled: false }), '');
});

test('Volver de la edición manual a un destino actualiza el estado de los accesos en ambas interfaces', () => {
  let s = editArm({ ...defaults }, 'armBaseAngle', 45);
  assert.equal(s.monitorMode, 'manual');
  for (const mode of ['desk', 'cockpit']) {
    s = editArm(s, 'monitorMode', mode);
    const guided = render(s, 'keyboard'),
      complete = monitorShortcuts(s);
    for (const html of [guided, complete]) {
      assert.ok(button(html, mode).includes('aria-pressed="true"'));
      assert.ok(
        button(html, mode === 'desk' ? 'cockpit' : 'desk').includes('aria-pressed="false"'),
      );
    }
    assert.equal(s.monitorMode, mode);
  }
});
