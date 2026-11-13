// Cockpit files: a cockpit design on its own, without any room, to move it from one project to
// another (see CONTEXT.md and docs/adr/0001). Lengths are in cm, as in project files.
import { sanitize } from './config.ts';
import {
  COCKPIT_DESIGN_KEYS,
  designOf,
  isCockpitDesignSetting,
  type CockpitDesign,
} from './cockpit-design.ts';

export interface CockpitFile {
  app: 'Cockpit Lab';
  kind: 'cockpit';
  version: 1;
  units: 'cm';
  cockpit: CockpitDesign;
}

export const cockpitFileData = (cockpit: CockpitDesign): CockpitFile => ({
  app: 'Cockpit Lab',
  kind: 'cockpit',
  version: 1,
  units: 'cm',
  cockpit,
});

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The cockpit design of a cockpit file. Throws a user-facing message when the file is something
 * else, or when its design is incomplete or has values this version can't use.
 */
export function readCockpitFile(data: unknown): CockpitDesign {
  if (!isPlainRecord(data) || data.app !== 'Cockpit Lab')
    throw new Error('File from another program');
  if (data.kind !== 'cockpit') throw new Error('This is not a cockpit file');
  if (data.version !== 1) throw new Error('Unsupported cockpit file version');
  if (data.units !== 'cm') throw new Error('Unsupported units');
  const raw = data.cockpit;
  if (!isPlainRecord(raw)) throw new Error('Invalid cockpit design');
  for (const key of Object.keys(raw))
    if (!isCockpitDesignSetting(key)) throw new Error(`Not a cockpit setting: ${key}`);
  for (const key of COCKPIT_DESIGN_KEYS)
    if (!(key in raw)) throw new Error(`Missing cockpit setting: ${key}`);
  const design = designOf(sanitize(raw));
  // Lengths and angles are fitted to their ranges, as in project files, but an unknown option
  // would silently become the default one, so it is rejected.
  for (const key of COCKPIT_DESIGN_KEYS)
    if (typeof raw[key] !== 'number' && design[key] !== raw[key])
      throw new Error(`Invalid value: ${key}`);
  return design;
}
