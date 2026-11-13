import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate } from '../src/model.ts';
import { creationControls } from '../src/setup-editor.ts';
import { saveArmPose } from '../src/arm-poses.ts';

const controls = { range: () => '', toggle: () => '', select: () => '' };
const render = (state, target) =>
  creationControls(state, evaluate(state), { step: 'desk' }, target, controls);

test('the Desk step offers the monitor position and the saved poses, whatever is selected', () => {
  const s = saveArmPose(defaults, 'Racing');
  for (const target of ['desk', 'arm', 'keyboard', 'pc', 'mouse', 'mat']) {
    const html = render(s, target);
    assert.match(html, /<select id="monitorPosition">/, target);
    assert.match(html, /<option value="pose:pose-1" selected>Racing<\/option>/, target);
    assert.match(html, /id="saveArmPose"/, target);
    assert.doesNotMatch(html, /data-monitor-pose/, target);
  }
});

test('the Desk step has no monitor position without a monitor or a desk', () => {
  assert.doesNotMatch(render({ ...defaults, monitorEnabled: false }, 'desk'), /monitorPosition/);
  assert.doesNotMatch(render({ ...defaults, deskEnabled: false }, 'desk'), /monitorPosition/);
});
