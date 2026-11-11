// Project file format and guided-setup progress. Lengths are in cm (format v2, `units: 'cm'`).
import { defaults, presets, sanitize, type CockpitConfig, type PresetId } from './config.ts';

export type StepId = 'room' | 'openings' | 'furniture' | 'desk' | 'cockpit';
export type SetupStep = StepId | 'complete';

export interface StepInfo {
  id: StepId;
  label: string;
  title: string;
  hint: string;
}

export const steps: StepInfo[] = [
  {
    id: 'room',
    label: 'Room',
    title: 'How big is your room?',
    hint: 'Enter the inside dimensions. Then we will place doors, windows and furniture.',
  },
  {
    id: 'openings',
    label: 'Openings',
    title: 'Doors and windows',
    hint: 'Add each opening, choose its wall and set its size and swing.',
  },
  {
    id: 'furniture',
    label: 'Furniture',
    title: 'What already takes up space',
    hint: 'Add the bed, wardrobe and other furniture. Drag them in the plan or type their position.',
  },
  {
    id: 'desk',
    label: 'Desk',
    title: 'Place your desk',
    hint: 'Enter its size and place it in the room. Add only the accessories you use.',
  },
  {
    id: 'cockpit',
    label: 'Cockpit',
    title: 'Now, your cockpit',
    hint: 'Choose a base, adjust its size and place it in the space available.',
  },
];

const LAST_STEP_INDEX = steps.length - 1;
const MAX_DRAFT_LENGTH = 32;

/** Unconfirmed form values, kept as typed text so a half-written number survives a reload. */
export interface MeasureDraft {
  w?: string;
  d?: string;
  h?: string;
}

export interface SetupDrafts {
  room?: MeasureDraft;
  desk?: MeasureDraft;
  preset?: PresetId | '';
}

export interface SetupProgress {
  step: SetupStep;
  /** Index of the furthest step reached. */
  furthest: number;
  /** Steps the user skipped and can come back to. */
  deferred: StepId[];
  drafts?: SetupDrafts;
}

export interface Project {
  config: CockpitConfig;
  setup: SetupProgress;
}

export interface ProjectFile extends Project {
  app: 'Cockpit Lab';
  version: 2;
  units: 'cm';
}

/** Elements every v2 file must state explicitly as present or absent. */
const PRESENCE_SETTINGS = [
  'deskEnabled',
  'cockpitEnabled',
  'monitorEnabled',
  'keyboardEnabled',
  'pcEnabled',
  'mouseEnabled',
  'matEnabled',
] as const;

type RawRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null;

const isStepId = (value: unknown): value is StepId => steps.some((step) => step.id === value);

const isSetupStep = (value: unknown): value is SetupStep => value === 'complete' || isStepId(value);

const isDraftPreset = (value: unknown): value is PresetId | '' =>
  value === '' || (typeof value === 'string' && Object.hasOwn(presets, value));

const isDraftMeasure = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_DRAFT_LENGTH &&
  (value === '' || Number.isFinite(Number(value)));

export const completeSetup = (): SetupProgress => ({
  step: 'complete',
  furthest: LAST_STEP_INDEX,
  deferred: [],
});

function readMeasureDraft(input: unknown): MeasureDraft {
  if (!isRecord(input)) throw new Error('Invalid draft measurements');
  const draft: MeasureDraft = {};
  for (const key of ['w', 'd', 'h'] as const) {
    const value = input[key];
    if (value === undefined) continue;
    if (!isDraftMeasure(value)) throw new Error('Invalid draft measurement');
    draft[key] = value;
  }
  return draft;
}

function readDrafts(input: unknown = {}): SetupDrafts {
  if (!isRecord(input) || Array.isArray(input)) throw new Error('Invalid draft');
  const drafts: SetupDrafts = {};
  for (const group of ['room', 'desk'] as const)
    if (input[group] !== undefined) drafts[group] = readMeasureDraft(input[group]);
  if (input.preset !== undefined) {
    if (!isDraftPreset(input.preset)) throw new Error('Invalid draft base');
    drafts.preset = input.preset;
  }
  return drafts;
}

/** A new, empty project: only the room is shown until the guided setup adds more. */
export function createProject(): Project {
  return {
    config: sanitize({
      ...structuredClone(defaults),
      roomX: 0,
      roomZ: 0,
      roomEnabled: false,
      deskEnabled: false,
      cockpitEnabled: false,
      monitorEnabled: false,
      keyboardEnabled: false,
      pcEnabled: false,
      mouseEnabled: false,
      matEnabled: false,
    }),
    setup: { step: 'room', furthest: 0, deferred: [] },
  };
}

/** Explicit v1 adapter: earlier projects always had a desk and a cockpit, and used cm. */
function readVersion1(data: RawRecord & { config: RawRecord }): Project {
  if (data.units && data.units !== 'cm') throw new Error('v1 designs use cm');
  return {
    config: sanitize({
      ...data.config,
      deskEnabled: true,
      cockpitEnabled: true,
      monitorEnabled: true,
      keyboardEnabled: true,
      pcEnabled: true,
      mouseEnabled: true,
      matEnabled: true,
    }),
    setup: completeSetup(),
  };
}

function readSetup(input: unknown, config: CockpitConfig): SetupProgress {
  if (
    !isRecord(input) ||
    !isSetupStep(input.step) ||
    typeof input.furthest !== 'number' ||
    !Number.isInteger(input.furthest) ||
    input.furthest < 0 ||
    input.furthest > LAST_STEP_INDEX ||
    !Array.isArray(input.deferred) ||
    !input.deferred.every(isStepId)
  )
    throw new Error('Invalid setup progress');
  const { step, furthest, deferred } = input;
  const index = steps.findIndex((s) => s.id === step);
  if (index > furthest || (step !== 'room' && step !== 'complete' && !config.roomEnabled))
    throw new Error('The room is not set up yet');
  return {
    step,
    furthest,
    deferred: [...new Set(deferred)],
    drafts: readDrafts(input.drafts),
  };
}

/**
 * Reads a project file (v1 or v2). `stored` skips the app check for the browser's own
 * saved copy. Throws a user-facing message when the file can't be used.
 */
export function readProject(data: unknown, { stored = false } = {}): Project {
  if (!data || (!stored && (data as RawRecord).app !== 'Cockpit Lab'))
    throw new Error('File from another program');
  const rawConfig = isRecord(data) ? data.config : undefined;
  if (!isRecord(data) || !isRecord(rawConfig) || Array.isArray(rawConfig))
    throw new Error('Invalid configuration');
  if (data.version === 1) return readVersion1({ ...data, config: rawConfig });
  if (data.version !== 2 || data.units !== 'cm') throw new Error('Unsupported version or units');
  for (const key of PRESENCE_SETTINGS)
    if (typeof rawConfig[key] !== 'boolean') throw new Error('Invalid item presence');
  const config = sanitize(rawConfig);
  return { config, setup: readSetup(data.setup, config) };
}

export function projectData(config: CockpitConfig, setup: SetupProgress): ProjectFile {
  return { app: 'Cockpit Lab', version: 2, units: 'cm', config, setup };
}

/** Moves to the next step; with `defer`, the current one is kept to revisit later. */
export function advanceSetup(
  setup: SetupProgress,
  { defer = false } = {},
): Omit<SetupProgress, 'drafts'> {
  const index = steps.findIndex((s) => s.id === setup.step);
  if (index < 0) return setup;
  const deferred = setup.deferred.filter((s) => s !== setup.step);
  if (defer) deferred.push(setup.step as StepId);
  return {
    step: steps[index + 1]?.id || 'complete',
    furthest: Math.max(setup.furthest, Math.min(LAST_STEP_INDEX, index + 1)),
    deferred,
  };
}
