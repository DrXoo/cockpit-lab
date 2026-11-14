// Draws the profiles of a CAD cockpit design. Parts are in mm in cockpit coordinates; the scene
// works in cm. Profiles at a tilt go into one group per tilt, turned about the cockpit origin as
// their frame is (src/cad/assembly.ts).
import { degToRad } from './geometry.ts';
import type { ParentRef, RenderList } from './render-list.ts';
import { profileBeam, type ProfileSection } from './render-profile.ts';
import type { ProfilePart, ResolvedPart } from './cad/assembly.ts';
import { MM_PER_CM } from './units.ts';

export function drawCadProfiles(
  r: RenderList,
  parent: ParentRef,
  resolved: ReadonlyMap<string, ResolvedPart>,
): void {
  const tiltGroups = new Map<number, ParentRef>();
  const frameOf = (tiltDeg: number): ParentRef => {
    if (tiltDeg === 0) return parent;
    let group = tiltGroups.get(tiltDeg);
    if (group === undefined) {
      group = r.group(parent, { rotation: [-degToRad(tiltDeg), 0, 0] });
      tiltGroups.set(tiltDeg, group);
    }
    return group;
  };
  for (const { part, box, lengthMm, tiltDeg } of resolved.values()) {
    if (part.kind !== 'profile') continue;
    const cm = (mm: number) => mm / MM_PER_CM;
    profileBeam(
      r,
      frameOf(tiltDeg),
      part.axis,
      cm(lengthMm),
      cm((box.min.x + box.max.x) / 2),
      cm((box.min.y + box.max.y) / 2),
      cm((box.min.z + box.max.z) / 2),
      drawnSection(part),
    );
  }
}

/** The drawing has a 40 × 80 upright across X, and lying 40 × 80s upright. */
function drawnSection(part: ProfilePart): ProfileSection {
  if (part.sectionId === '40x40') return '40x40';
  const drawnHeightAxis = part.axis === 'y' ? 'x' : 'y';
  if (part.sectionId === '40x80' && part.heightAxis === drawnHeightAxis) return '40x80';
  throw new Error(`Profile ${part.id} has a section or orientation the drawing cannot show.`);
}
