// One change to a setting, as the settings panel makes it: a number, a toggle or a choice.
import { choiceOptions, type RoomConfig, type NumericField } from './config.ts';
import type { BooleanSetting, ChoiceSetting } from './controls-view.ts';
import { desktopTargets, placeDeskItem, updateDeskItem } from './desk.ts';
import { editArm } from './monitor-arm.ts';

export type SettingChange =
  | { kind: 'number'; key: NumericField; value: number }
  | { kind: 'toggle'; key: BooleanSetting; value: boolean }
  | { kind: 'choice'; key: ChoiceSetting; value: string };

/**
 * Applies a change with the rules that depend on it: the monitor arm follows its mode, and
 * desktop objects stay on the desk.
 */
export function applySetting(s: RoomConfig, change: SettingChange): RoomConfig {
  if (change.kind === 'number')
    return updateDeskItem(editArm(s, change.key, change.value), change.key, change.value);
  if (change.kind === 'choice' && !choiceOptions(change.key)?.includes(change.value))
    throw new Error(`Invalid value for ${change.key}: ${change.value}`);
  const next: RoomConfig = {
    ...editArm(s, change.key, change.value),
    [change.key]: change.value,
  };
  // Toggles such as keyboardEnabled place the object again, as its position settings do.
  const target = desktopTargets.find((t) => change.key.startsWith(t.prefix));
  return target
    ? placeDeskItem(next, target.id, next[`${target.prefix}X`], next[`${target.prefix}Z`])
    : next;
}
