// The names of the files a plate is exported to: what a shop or a workbench needs to tell one
// plate's files from another's. Quantities are in the parts to buy, not here.
import type { PlatePart } from '../parts/assembly.ts';
import { sheetType } from '../parts/catalog.ts';
import { fabricationProcess } from '../parts/fabrication.ts';

/** Characters that Windows, macOS or Linux refuse in a file name, and control characters. */
const UNSAFE_IN_FILE_NAMES = /[\\/:*?"<>|\u0000-\u001f]/g;

/** "Seat plate - Aluminium sheet, 5 mm - Laser or water-jet cutting.dxf" */
export function plateFileName(plate: PlatePart, extension: 'dxf' | 'svg'): string {
  const sheet = sheetType(plate.sheetId).name;
  const process = fabricationProcess(plate.processId).name;
  const name = `${plate.name} - ${sheet} - ${process}`.replace(UNSAFE_IN_FILE_NAMES, '-');
  return `${name}.${extension}`;
}
