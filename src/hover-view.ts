// The label shown by the pointer over a part of the cockpit design: its name, with the size
// that tells it apart, as "Left rail · 40 × 80 · 1200 mm".
import type { ResolvedPart } from './cad/assembly.ts';
import { profileSection, profileSystem, sheetType } from './cad/catalog.ts';
import { round } from './shared/geometry.ts';

/** Lengths are shown to the tenth of a mm, as the design history shows them. */
const LENGTH_DECIMALS = 1;
const mm = (valueMm: number) => round(valueMm, LENGTH_DECIMALS);

export function hoverLabel({ part, lengthMm }: ResolvedPart): string {
  switch (part.kind) {
    case 'profile': {
      const section = profileSection(profileSystem(part.systemId), part.sectionId);
      return `${part.name} · ${section.widthMm} × ${section.heightMm} · ${mm(lengthMm)} mm`;
    }
    case 'plate':
      return `${part.name} · ${mm(part.widthMm)} × ${mm(part.depthMm)} mm · ${sheetType(part.sheetId).thicknessMm} mm`;
    case 'foot':
    case 'peripheral':
      return part.name;
  }
}
