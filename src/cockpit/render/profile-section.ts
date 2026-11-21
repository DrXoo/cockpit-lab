// The cross-section of an aluminium profile as drawn: its outline with a T slot in the middle of
// each module of each face, and a bore in the middle of each module. Only the outside and the
// slot opening come from the catalog; the slot's inside and the bore are typical of an I-type
// slot, scaled with the series, for drawing only: no check or measurement uses them.
import type { ProfileSection, ProfileSystem } from '../cad/parts/catalog.ts';

/** A point of the section, in mm: `u` across its width, `v` across its height, from its center. */
export type SectionPoint = readonly [u: number, v: number];

export interface SectionOutline {
  /** The outside, anticlockwise, with the slots cut into it. */
  outer: SectionPoint[];
  /** The bores through the profile. */
  holes: SectionPoint[][];
}

/**
 * The inside of a slot and the bore, as shares of the series module, estimated from drawings of
 * the 40 series I-type slot 8: lips 4 mm thick, then a 16 mm wide space for a T-nut's head 3 mm
 * deep, narrowing to the opening's width 11 mm into the profile; a 6.8 mm bore, the tap drill of
 * the M8 thread at a profile's end.
 */
const LIP_SHARE = 0.1;
const NUT_SPACE_HALF_WIDTH_SHARE = 0.2;
const NUT_SPACE_DEPTH_SHARE = 0.075;
const SLOT_DEPTH_SHARE = 0.275;
const BORE_DIAMETER_SHARE = 0.17;
const BORE_SEGMENTS = 20;

/** Each face of the section, walked anticlockwise: where it starts, its way and inwards. */
interface FaceWalk {
  start: SectionPoint;
  way: SectionPoint;
  inward: SectionPoint;
  lengthMm: number;
}

/** The outline of a section of a profile system, as its profiles are drawn. */
export function profileSectionOutline(
  system: ProfileSystem,
  section: ProfileSection,
): SectionOutline {
  const halfWidth = section.widthMm / 2;
  const halfHeight = section.heightMm / 2;
  const faces: FaceWalk[] = [
    { start: [-halfWidth, -halfHeight], way: [1, 0], inward: [0, 1], lengthMm: section.widthMm },
    { start: [halfWidth, -halfHeight], way: [0, 1], inward: [-1, 0], lengthMm: section.heightMm },
    { start: [halfWidth, halfHeight], way: [-1, 0], inward: [0, -1], lengthMm: section.widthMm },
    { start: [-halfWidth, halfHeight], way: [0, -1], inward: [1, 0], lengthMm: section.heightMm },
  ];
  const outer = faces.flatMap((face) => faceWithSlots(face, system));
  return { outer, holes: boreCenters(system, section).map((center) => bore(center, system)) };
}

/** A face's corner, then each of its slots in the order the walk meets them. */
function faceWithSlots(face: FaceWalk, system: ProfileSystem): SectionPoint[] {
  const slots = modulesAlong(face.lengthMm, system.series);
  const points: SectionPoint[] = [face.start];
  for (let slot = 0; slot < slots; slot++) {
    const centerMm = ((slot + 0.5) * face.lengthMm) / slots;
    for (const [alongMm, depthMm] of slotProfile(system))
      points.push([
        face.start[0] + face.way[0] * (centerMm + alongMm) + face.inward[0] * depthMm,
        face.start[1] + face.way[1] * (centerMm + alongMm) + face.inward[1] * depthMm,
      ]);
  }
  return points;
}

/**
 * A slot as points along the face from its center and into the profile, in the order the walk
 * meets them: in through the opening, out to the space for a T-nut's head, narrowing to the
 * bottom, and back out.
 */
function slotProfile(system: ProfileSystem): SectionPoint[] {
  const { series } = system;
  const opening = system.slotWidthMm / 2;
  const lip = series * LIP_SHARE;
  const nutSpace = series * NUT_SPACE_HALF_WIDTH_SHARE;
  const nutSpaceBottom = lip + series * NUT_SPACE_DEPTH_SHARE;
  const bottom = series * SLOT_DEPTH_SHARE;
  const oneSide: SectionPoint[] = [
    [-opening, 0],
    [-opening, lip],
    [-nutSpace, lip],
    [-nutSpace, nutSpaceBottom],
    [-opening, bottom],
  ];
  const otherSide = oneSide.map(([alongMm, depthMm]): SectionPoint => [-alongMm, depthMm]);
  return [...oneSide, ...otherSide.reverse()];
}

/** How many modules of the series a face of this length is: one slot each. */
const modulesAlong = (lengthMm: number, series: number) =>
  Math.max(1, Math.round(lengthMm / series));

/** The middle of each module of the section, along its longer side. */
function boreCenters(system: ProfileSystem, section: ProfileSection): SectionPoint[] {
  const alongHeight = section.heightMm >= section.widthMm;
  const lengthMm = alongHeight ? section.heightMm : section.widthMm;
  const modules = modulesAlong(lengthMm, system.series);
  return Array.from({ length: modules }, (_, module) => {
    const offsetMm = ((module + 0.5) * lengthMm) / modules - lengthMm / 2;
    return alongHeight ? [0, offsetMm] : [offsetMm, 0];
  });
}

function bore(center: SectionPoint, system: ProfileSystem): SectionPoint[] {
  const radiusMm = (system.series * BORE_DIAMETER_SHARE) / 2;
  return Array.from({ length: BORE_SEGMENTS }, (_, index) => {
    const angle = (2 * Math.PI * index) / BORE_SEGMENTS;
    return [center[0] + radiusMm * Math.cos(angle), center[1] + radiusMm * Math.sin(angle)];
  });
}
