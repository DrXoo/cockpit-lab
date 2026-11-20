import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, evaluate } from '../../../src/room/model.ts';
import { creationControls } from '../../../src/room/editing/setup-editor.ts';
import type { RoomConfig } from '../../../src/room/config.ts';

const controls = { range: () => '', toggle: () => '', select: () => '' };
const roomStep = (state: RoomConfig) =>
  creationControls(
    state,
    evaluate(state),
    { step: 'room', furthest: 0, deferred: [] },
    '',
    controls,
  );

test('the first room step also offers to start with the cockpit instead', () => {
  const html = roomStep({ ...defaults, roomEnabled: false });
  assert.match(html, /<form id="setupRoomForm"/);
  assert.match(html, /<button[^>]*id="startWithCockpit"/);
  assert.doesNotMatch(roomStep({ ...defaults, roomEnabled: true }), /id="startWithCockpit"/);
});
