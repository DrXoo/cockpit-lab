// Dimensions drawn over a CAD cockpit design: the length of the selected profile, and where a part
// being placed is along the profile it hangs from. Parts are in mm in their own frame
// (src/cad/assembly.ts); lines and labels are drawn in cockpit cm, so a tilted part is measured
// in its frame and turned out of it.
import { tiltedFromPivot, type Axis, type ResolvedPart, type Vec3Mm } from './cad/assembly.ts';
import { round } from './geometry.ts';
import type { ParentRef, RenderList, SceneLabel, Vec3 } from './render-list.ts';
import { SIGHT_AXIS, type SceneView } from './scene-camera.ts';
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
  const axis = selected.part.axis;
  const { box, lengthMm } = selected;
  drawAlongProfile(r, parent, selected, view, {
    fromMm: box.min[axis],
    toMm: box.max[axis],
    text: `${round(lengthMm, LENGTH_DECIMALS)} mm`,
    measures: 'part-length',
  });
}

/**
 * Where a part is on the profile it hangs from: from each end of the profile to the part's
 * center, as two dimensions beside the profile.
 */
export function drawPlacementAlong(
  r: RenderList,
  parent: ParentRef,
  resolved: ReadonlyMap<string, ResolvedPart>,
  partId: string | null,
  view: SceneView,
): void {
  const placed = partId === null ? undefined : resolved.get(partId);
  if (!placed || placed.part.placement.kind === 'anchor') return;
  const profile = resolved.get(placed.part.placement.parentId);
  if (!profile || profile.part.kind !== 'profile') return;
  const axis = profile.part.axis;
  const centerMm = (placed.box.min[axis] + placed.box.max[axis]) / 2;
  const measured = (fromMm: number, toMm: number, measures: string) =>
    drawAlongProfile(r, parent, profile, view, {
      fromMm,
      toMm,
      text: `${round(toMm - fromMm, LENGTH_DECIMALS)} mm`,
      measures,
    });
  // A part is placed by these: they show whether dimensions are shown or not.
  measured(profile.box.min[axis], centerMm, 'placement-start').alwaysShown = true;
  measured(centerMm, profile.box.max[axis], 'placement-end').alwaysShown = true;
}

/** A dimension along a profile, between two points of its length, standing off beside it. */
interface AlongProfile {
  fromMm: number;
  toMm: number;
  text: string;
  /** What the label measures, for the view to tell its labels apart. */
  measures: string;
}

function drawAlongProfile(
  r: RenderList,
  parent: ParentRef,
  profile: ResolvedPart,
  view: SceneView,
  { fromMm, toMm, text, measures }: AlongProfile,
): SceneLabel {
  const { box, tiltDeg } = profile;
  const lengthAxis = lengthAxisOf(profile);
  // The length and the line of sight leave at least one of the three axes to stand off along.
  const offsetAxis =
    OFFSET_PREFERENCE.find((axis) => axis !== lengthAxis && axis !== SIGHT_AXIS[view]) ?? 'y';
  const start: Vec3Mm = {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
  start[offsetAxis] = box.max[offsetAxis] + DIMENSION_CLEARANCE_MM;
  start[lengthAxis] = fromMm;
  const end = { ...start, [lengthAxis]: toMm };
  const inCockpitCm = (pointMm: Vec3Mm): Vec3 => {
    const { x, y, z } = tiltedFromPivot(ORIGIN, pointMm, tiltDeg);
    return [x / MM_PER_CM, y / MM_PER_CM, z / MM_PER_CM];
  };
  const standoff = inCockpitCm({ x: 0, y: 0, z: 0, [offsetAxis]: LABEL_STANDOFF_MM });
  const label = r.dimension(inCockpitCm(start), inCockpitCm(end), text, standoff, parent);
  label.measures = measures;
  return label;
}

function lengthAxisOf({ part }: ResolvedPart): Axis {
  if (part.kind !== 'profile') throw new Error(`${part.name} is not a profile: it has no length.`);
  return part.axis;
}
