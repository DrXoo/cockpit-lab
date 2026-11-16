import { fields, type RoomConfig, type FieldRange, type NumericField } from './config.ts';
import { deskBounds } from './desk.ts';

/** Range of a setting for the current configuration: some limits depend on other settings. */
export function fieldSpec(key: NumericField, s: RoomConfig): FieldRange {
  const b = deskBounds(s);
  if (key === 'clampX') return [-b.anchorX, b.anchorX, 0.1];
  if (key === 'clampZ') return [-b.anchorZ, b.anchorZ, 0.1];
  if (/^(keyboard|pc|mouse|mat)X$/.test(key)) return [-b.halfX, b.halfX, 0.1];
  if (/^(keyboard|pc|mouse|mat)Z$/.test(key)) return [-b.halfZ, b.halfZ, 0.1];
  return fields[key];
}
