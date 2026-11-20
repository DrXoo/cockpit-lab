// Peripherals mounted on plates put their mounting patterns into the plate as holes that follow
// them. Plate coordinates: X across the plate and Y along its depth, from its center.
import type { ResolvedPart } from './assembly.ts';
import { plateHoles, type Hole, type PlateMounting } from './plate.ts';

/** Every hole of a plate in the design: its own, then those of the peripherals mounted on it. */
export function holesOfPlate(resolved: ReadonlyMap<string, ResolvedPart>, plateId: string): Hole[] {
  const plate = resolved.get(plateId);
  if (plate?.part.kind !== 'plate') throw new Error(`Part ${plateId} is not a plate.`);
  const plateCenterX = (plate.box.min.x + plate.box.max.x) / 2;
  const plateCenterZ = (plate.box.min.z + plate.box.max.z) / 2;
  const mountings: PlateMounting[] = [];
  for (const { part, box } of resolved.values()) {
    if (part.kind !== 'peripheral' || part.placement.kind !== 'attachment') continue;
    if (part.placement.parentId !== plateId) continue;
    mountings.push({
      pattern: part.mountingPattern,
      originXMm: (box.min.x + box.max.x) / 2 - plateCenterX,
      originYMm: (box.min.z + box.max.z) / 2 - plateCenterZ,
    });
  }
  return plateHoles(plate.part, mountings);
}
