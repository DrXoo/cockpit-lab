// Dimensions drawn over a CAD cockpit design: the length of the selected profile. Parts are in
// mm in their own frame (src/cad/assembly.ts); lines and labels are drawn in cockpit cm, so a
// tilted part is measured in its frame and turned out of it.
import { tiltedFromPivot, type Axis, type ResolvedPart, type Vec3Mm } from './cad/assembly.ts';
import { round } from './geometry.ts';
import type { ParentRef, RenderList, Vec3 } from './render-list.ts';
import type { SceneView } from './scene-camera.ts';
import { MM_PER_CM } from './units.ts';

/** How far a dimension stands off the face of the part it measures. */
const DIMENSION_CLEARANCE_MM = 50;
/** How far its label stands beyond the line, so it does not cover the part. */
const LABEL_STANDOFF_MM = 50;
/** Lengths are shown to the tenth of a mm, as the design history shows them. */
const LENGTH_DECIMALS = 1;

const ORIGIN: Vec3Mm = { x: 0, y: 0, z: 0 };
/** The axes a dimension may stand off along, best first: above, then in front, then beside. */
const OFFSET_PREFERENCE: readonly Axis[] = ['y', 'z', 'x'];
/** The axis a view looks along, which a dimension must not stand off along to be seen. */
const SIGHT_AXIS: Record<SceneView, Axis | null> = { iso: null, top: 'y', desk: 'y', side: 'x' };

/** The length of the selected profile, as a dimension beside it that the view can show. */
export function drawPartLength(
  r: RenderList,
  parent: ParentRef,
  resolved: ReadonlyMap<string, ResolvedPart>,
  selectedId: string | null,
  view: SceneView,
): void {
  const selected = selectedId === null ? undefined : resolved.get(selectedId);
  if (!selected || selected.part.kind !== 'profile') return;
  const { box, tiltDeg, lengthMm } = selected;
  const lengthAxis = selected.part.axis;
  const offsetAxis = OFFSET_PREFERENCE.find(
    (axis) => axis !== lengthAxis && axis !== SIGHT_AXIS[view],
  );
  if (offsetAxis === undefined) return;
  const start: Vec3Mm = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
  start[offsetAxis] = box.max[offsetAxis] + DIMENSION_CLEARANCE_MM;
  start[lengthAxis] = box.min[lengthAxis];
  const end = { ...start, [lengthAxis]: box.max[lengthAxis] };
  const inCockpitCm = (pointMm: Vec3Mm): Vec3 => {
    const { x, y, z } = tiltedFromPivot(ORIGIN, pointMm, tiltDeg);
    return [x / MM_PER_CM, y / MM_PER_CM, z / MM_PER_CM];
  };
  const text = `${round(lengthMm, LENGTH_DECIMALS)} mm`;
  const standoff = inCockpitCm({ x: 0, y: 0, z: 0, [offsetAxis]: LABEL_STANDOFF_MM });
  const label = r.dimension(inCockpitCm(start), inCockpitCm(end), text, standoff, parent);
  label.measures = 'part-length';
}
