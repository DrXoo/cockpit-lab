// Aluminium profiles as drawn: an outlined bar with slot grooves along its length.
import type { BoxPrimitive, ParentRef, RenderList } from './render-list.ts';

export type ProfileAxis = 'x' | 'y' | 'z';
export type ProfileSection = '40x40' | '40x80';

/** Side of a 40 series profile. */
const PROFILE_SIDE_CM = 4;
/** Long side of a 40 × 80 profile. */
const WIDE_SIDE_CM = 8;
/** Grooves stop this much short of the profile length. */
const GROOVE_SHORTFALL_CM = 0.5;

/** A profile centred on (x, y, z), running along `axis`. */
export function profileBeam(
  r: RenderList,
  parent: ParentRef,
  axis: ProfileAxis,
  length: number,
  x: number,
  y: number,
  z: number,
  section: ProfileSection = '40x40',
): BoxPrimitive {
  const deep = section === '40x80' ? WIDE_SIDE_CM : PROFILE_SIDE_CM;
  let w = PROFILE_SIDE_CM;
  let h = deep;
  let d = length;
  if (axis === 'x') {
    w = length;
    d = PROFILE_SIDE_CM;
  }
  if (axis === 'y') {
    w = deep;
    h = length;
    d = PROFILE_SIDE_CM;
  }
  const bar = r.box(w, h, d, x, y, z, 'silver', parent, true);
  const grooveLength = length - GROOVE_SHORTFALL_CM;
  if (axis === 'z') {
    for (const dx of [-1.1, 1.1])
      r.box(0.28, 0.09, grooveLength, dx, h / 2 + 0.04, 0, 'groove', bar.id);
    for (const dy of [-h / 4, h / 4])
      r.box(0.09, 0.3, grooveLength, w / 2 + 0.04, dy, 0, 'groove', bar.id);
  }
  if (axis === 'x') {
    for (const dz of [-1.1, 1.1])
      r.box(grooveLength, 0.09, 0.28, 0, h / 2 + 0.04, dz, 'groove', bar.id);
    for (const dy of [-h / 4, h / 4])
      r.box(grooveLength, 0.3, 0.09, 0, dy, d / 2 + 0.04, 'groove', bar.id);
  }
  if (axis === 'y') {
    for (const dx of [-w / 4, w / 4])
      r.box(0.3, grooveLength, 0.09, dx, 0, d / 2 + 0.04, 'groove', bar.id);
  }
  return bar;
}
