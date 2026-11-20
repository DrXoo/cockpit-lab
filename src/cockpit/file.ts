// Cockpit files: a cockpit design on its own, without any room, to move it from one project to
// another (see CONTEXT.md and docs/adr/0001). Version 2 stores the design history in mm
// (docs/adr/0005); version 1 held a parametric cockpit, which is retired (docs/adr/0004).
import { designData, readDesign, type CockpitDesign, type CockpitDesignData } from './design.ts';

export interface CockpitFile {
  app: 'Cockpit Lab';
  kind: 'cockpit';
  version: 2;
  cockpit: CockpitDesignData;
}

/** The version of the cockpit files that held a parametric cockpit. */
const PARAMETRIC_VERSION = 1;

export const PARAMETRIC_COCKPIT_FILE_MESSAGE =
  'This cockpit file was made with the retired configurator';

export const cockpitFileData = (cockpit: CockpitDesign): CockpitFile => ({
  app: 'Cockpit Lab',
  kind: 'cockpit',
  version: 2,
  cockpit: designData(cockpit),
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The cockpit design of a cockpit file. Throws a user-facing message when the file is something
 * else, holds a retired parametric cockpit, or has a design this version can't use.
 */
export function readCockpitFile(data: unknown): CockpitDesign {
  if (!isPlainRecord(data) || data.app !== 'Cockpit Lab')
    throw new Error('File from another program');
  if (data.kind !== 'cockpit') throw new Error('This is not a cockpit file');
  if (data.version === PARAMETRIC_VERSION) throw new Error(PARAMETRIC_COCKPIT_FILE_MESSAGE);
  if (data.version !== 2) throw new Error('Unsupported cockpit file version');
  return readDesign(data.cockpit);
}
