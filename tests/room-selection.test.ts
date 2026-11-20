import test from 'node:test';
import assert from 'node:assert/strict';
import { defaults, type RoomConfig } from '../src/config.ts';
import { addRoomItem, type RoomItemType } from '../src/room-actions.ts';
import {
  panelTarget,
  targetAfterLayoutChange,
  targetAfterSwitch,
  type PanelContext,
} from '../src/room-editing/selection.ts';

/** The default room with an item of each type added, with the targets they got. */
function roomWith(...types: RoomItemType[]): { state: RoomConfig; targets: string[] } {
  let state: RoomConfig = { ...defaults, roomEnabled: true };
  const targets: string[] = [];
  types.forEach((type, index) => {
    const added = addRoomItem(state, type, `item-${index}`);
    state = added.state;
    targets.push(added.target);
  });
  return { state, targets };
}

const NO_DESKTOP_ITEMS: readonly string[] = [];

test('the openings tab keeps the opening selected, or selects the first, or none', () => {
  const { state, targets } = roomWith('door', 'window', 'chair');
  const [door, window, chair] = targets;
  const openings: PanelContext = {
    section: 'room',
    stage: 'openings',
    state,
    desktopItemIds: NO_DESKTOP_ITEMS,
  };
  assert.equal(panelTarget(window, openings), window);
  assert.equal(panelTarget(chair, openings), door);
  assert.equal(panelTarget(chair, { ...openings, state: roomWith().state }), '');
});

test('the furniture tab keeps the furniture selected, or selects the first', () => {
  const { state, targets } = roomWith('door', 'chair');
  const [door, chair] = targets;
  const furniture: PanelContext = {
    section: 'furniture',
    stage: 'furniture',
    state,
    desktopItemIds: NO_DESKTOP_ITEMS,
  };
  assert.equal(panelTarget(chair, furniture), chair);
  assert.equal(panelTarget(door, furniture), chair);
});

test('the desk tab keeps the desk or an item on the desktop, and selects the desk otherwise', () => {
  const { state, targets } = roomWith('chair');
  const desk: PanelContext = {
    section: 'desk',
    stage: 'openings',
    state,
    desktopItemIds: ['keyboard'],
  };
  assert.equal(panelTarget('keyboard', desk), 'keyboard');
  assert.equal(panelTarget('desk', desk), 'desk');
  assert.equal(panelTarget(targets[0], desk), 'desk');
  assert.equal(panelTarget('pc', desk), 'desk');
});

test('switching to the desk drops a room item, and to the room a target it does not have', () => {
  const { state, targets } = roomWith('door', 'chair');
  const [door, chair] = targets;
  assert.equal(targetAfterSwitch(door, 'desk', state), 'desk');
  assert.equal(targetAfterSwitch(chair, 'desk', state), 'desk');
  assert.equal(targetAfterSwitch('arm', 'desk', state), 'arm');
  assert.equal(targetAfterSwitch(door, 'room', state), door);
  assert.equal(targetAfterSwitch('arm', 'room', state), 'desk');
  assert.equal(targetAfterSwitch('feature:gone', 'room', state), 'desk');
  assert.equal(targetAfterSwitch('arm', 'design', state), 'arm');
});

test('a layout without the furniture selected leaves nothing selected', () => {
  const { state, targets } = roomWith('chair');
  assert.equal(targetAfterLayoutChange(targets[0], state), targets[0]);
  assert.equal(targetAfterLayoutChange('furniture:gone', state), '');
  assert.equal(targetAfterLayoutChange('arm', state), 'arm');
});
