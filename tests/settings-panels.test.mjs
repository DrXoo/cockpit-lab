import test from 'node:test';
import assert from 'node:assert/strict';
import { deskPanelHTML } from '../src/settings-panels.ts';
import { emptyDesignHTML } from '../src/cockpit-editor-view.ts';
import { defaults, evaluate } from '../src/model.ts';
import { saveArmPose, applyArmPose } from '../src/arm-poses.ts';

const viewOf = (overrides = {}) => {
  const state = { ...defaults, ...overrides };
  return { state, evaluation: evaluate(state) };
};
const keysIn = (html) => [...html.matchAll(/id="([a-zA-Z]+)-range"/g)].map((match) => match[1]);

test('the desk panel includes the monitor arm only when there is a monitor', () => {
  const withMonitor = deskPanelHTML(viewOf(), 'desk');
  assert.match(withMonitor, /<div class="control-group" id="armControls">/);
  assert.ok(keysIn(withMonitor).includes('armReach'));
  const without = deskPanelHTML(viewOf({ monitorEnabled: false }), 'desk');
  assert.doesNotMatch(without, /id="armControls"/);
  assert.ok(!keysIn(without).includes('armReach'));
});

test('the desk panel marks the current tabletop size', () => {
  const html = deskPanelHTML(viewOf({ deskWidth: 160, deskDepth: 80 }), 'desk');
  assert.match(html, /<option value="160x80" selected>160 × 80 cm<\/option>/);
});

test('the desk panel places the desk and its items, and nothing else in the room', () => {
  const html = deskPanelHTML(viewOf(), 'desk');
  assert.deepEqual(
    [...html.matchAll(/<option value="([a-z]+)"[^>]*>/g)]
      .map((match) => match[1])
      .filter((value) => ['desk', 'cockpit'].includes(value)),
    ['desk'],
  );
  assert.doesNotMatch(html, /id="layoutPreset"/);
});

test('an empty cockpit design explains how designs start', () => {
  assert.match(emptyDesignHTML(), /id="emptyDesign"/);
});

const panelWith = (state, selectedPose = '') =>
  deskPanelHTML({ state, evaluation: evaluate(state) }, 'desk', selectedPose);
/** An option of the monitor position select, ignoring the other selects of the panel. */
const optionOf = (html, value) =>
  html
    .match(/<select id="monitorPosition">.*?<\/select>/)?.[0]
    .match(new RegExp(`<option value="${value}"[^>]*>[^<]*</option>`))?.[0];
const twoPoses = () => {
  const racing = saveArmPose(defaults, 'Racing');
  return saveArmPose({ ...racing, monitorH: racing.monitorH + 10 }, 'Desk <2>');
};

test('the monitor position lists the saved poses first, then the automatic positions', () => {
  const html = panelWith(twoPoses());
  assert.match(html, /<select id="monitorPosition">/);
  assert.doesNotMatch(html, /id="monitorMode"/);
  assert.doesNotMatch(html, /data-monitor-pose|data-arm-pose/);
  assert.ok(
    html.indexOf('<optgroup label="Your poses">') < html.indexOf('<optgroup label="Automatic">'),
  );
  assert.equal(optionOf(html, 'pose:pose-1'), '<option value="pose:pose-1">Racing</option>');
  assert.equal(
    optionOf(html, 'pose:pose-2'),
    '<option value="pose:pose-2" selected>Desk 2</option>',
  );
  for (const mode of ['desk', 'vr']) assert.ok(optionOf(html, `auto:${mode}`), mode);
  assert.equal(optionOf(html, 'auto:cockpit'), undefined);
  assert.equal(optionOf(html, 'custom'), undefined);
  assert.match(html, /<button[^>]*id="updateArmPose"[^>]*disabled/);
  assert.match(html, /<button[^>]*id="deleteArmPose"/);
  assert.match(html, /<input[^>]*id="armPoseName"[^>]*maxlength="40"/);
  assert.match(html, /<button[^>]*id="saveArmPose"/);
});

test('a pose the arm has moved away from stays chosen, marked as changed, and can be updated', () => {
  const s = twoPoses();
  const html = panelWith({ ...s, monitorH: s.monitorH + 4 }, 'pose-2');
  assert.equal(
    optionOf(html, 'pose:pose-2'),
    '<option value="pose:pose-2" selected>Desk 2 · changed</option>',
  );
  assert.doesNotMatch(html, /<button[^>]*id="updateArmPose"[^>]*disabled/);
  assert.match(html, /<button[^>]*id="updateArmPose"/);
});

test('joints that match no pose show as a custom position, without pose actions', () => {
  const s = twoPoses();
  const html = panelWith({ ...s, monitorH: s.monitorH + 4 });
  assert.equal(
    optionOf(html, 'custom'),
    '<option value="custom" selected>Custom (not saved)</option>',
  );
  assert.doesNotMatch(html, /id="updateArmPose"|id="deleteArmPose"/);
});

test('an automatic position is chosen when the arm follows it', () => {
  const html = panelWith({ ...twoPoses(), monitorMode: 'desk' }, 'pose-1');
  assert.match(optionOf(html, 'auto:desk'), / selected>/);
  assert.doesNotMatch(optionOf(html, 'pose:pose-1'), /selected/);
});

test('without saved poses the monitor position offers the automatic positions and a hint', () => {
  const html = panelWith(defaults);
  assert.doesNotMatch(html, /Your poses/);
  assert.ok(optionOf(html, 'auto:desk'));
  assert.match(html, /id="armPoseHint"/);
});

test('a pose saved with the arm mounted elsewhere says so in text', () => {
  const s = saveArmPose(defaults, 'Racing');
  const html = panelWith({ ...s, clampX: s.clampX + 10 });
  assert.match(
    html,
    /<small data-mount-moved="pose-1">Saved with the arm mounted elsewhere<\/small>/,
  );
});
