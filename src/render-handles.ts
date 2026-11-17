// Draws the stems of the handles of the selected part: a thin bar from the end a handle changes
// out to the handle itself, which the scene shows as a ball on top of the view. Positions are in
// mm in cockpit coordinates; the scene works in cm.
import type { Handle } from './cad/handles.ts';
import type { Vec3Mm } from './cad/assembly.ts';
import type { ParentRef, RenderList } from './render-list.ts';
import { MM_PER_CM } from './units.ts';

/** How far a handle stands off the end it changes, so it never hides behind the part. */
const HANDLE_STANDOFF_MM = 40;
const STEM_THICKNESS_CM = 0.3;

/** Where the ball of a handle is, off the end it changes. */
export function handleBallMm({ pointMm, outwardMm }: Handle): Vec3Mm {
  return {
    x: pointMm.x + outwardMm.x * HANDLE_STANDOFF_MM,
    y: pointMm.y + outwardMm.y * HANDLE_STANDOFF_MM,
    z: pointMm.z + outwardMm.z * HANDLE_STANDOFF_MM,
  };
}

export function drawHandleStems(
  r: RenderList,
  parent: ParentRef,
  handles: readonly Handle[],
): void {
  for (const handle of handles) {
    const from = handle.pointMm;
    const to = handleBallMm(handle);
    const size = (['x', 'y', 'z'] as const).map((axis) =>
      Math.max(Math.abs(to[axis] - from[axis]) / MM_PER_CM, STEM_THICKNESS_CM),
    );
    r.box(
      size[0],
      size[1],
      size[2],
      (from.x + to.x) / 2 / MM_PER_CM,
      (from.y + to.y) / 2 / MM_PER_CM,
      (from.z + to.z) / 2 / MM_PER_CM,
      'hover',
      parent,
    );
  }
}
