// Project file format and guided-setup progress. Lengths are in cm (`units: 'cm'`). Format v4
// stores the cockpit design apart from the room and its layouts. v3 files keep the design among
// the room's shared settings; v1 and v2 files hold a single configuration and open as one
// layout.
import { defaults, sanitize, type CockpitConfig } from './config.ts';
import {
  FURNITURE_PLACEMENT_KEYS,
  MAX_LAYOUTS,
  createLayoutLibrary,
  isLayoutSetting,
  layoutConfig,
  libraryFromLayouts,
  recordLayout,
  type LayoutEntry,
  type LayoutLibrary,
} from './layouts.ts';
import {
  designOf,
  isCockpitDesignSetting,
  splitCockpit,
  type CockpitDesign,
} from './cockpit-design.ts';

export type StepId = 'room' | 'openings' | 'furniture' | 'desk';
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
];
/**
 * The step that designed a cockpit until the room setup stopped doing it. Saved progress that
 * reached it opens with the setup complete.
 */
const RETIRED_COCKPIT_STEP = 'cockpit';

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
}

export interface SetupProgress {
  step: SetupStep;
  /** Index of the furthest step reached. */
  furthest: number;
  /** Steps the user skipped and can come back to. */
  deferred: StepId[];
  drafts?: SetupDrafts;
}

/** A cockpit design, or none, and the room whose layouts place it. */
export interface Project {
  cockpit: CockpitDesign | null;
  library: LayoutLibrary;
  setup: SetupProgress;
}

export interface ProjectFile {
  cockpit: CockpitDesign | null;
  room: LayoutLibrary;
  app: 'Cockpit Lab';
  version: 4;
  units: 'cm';
  setup: SetupProgress;
}

/** Elements every v2 and v3 file must state explicitly as present or absent. */
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

const isPlainRecord = (value: unknown): value is RawRecord =>
  isRecord(value) && !Array.isArray(value);

/** Layout ids follow the pattern of room item ids. */
const LAYOUT_ID = /^[a-z0-9-]{1,50}$/i;

const isStepId = (value: unknown): value is StepId => steps.some((step) => step.id === value);

const isSetupStep = (value: unknown): value is SetupStep => value === 'complete' || isStepId(value);

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
  // A base chosen in the retired cockpit step is not needed any more.
  for (const group of ['room', 'desk'] as const)
    if (input[group] !== undefined) drafts[group] = readMeasureDraft(input[group]);
  return drafts;
}

/** The configuration of a layout of the project, the active one by default. */
export const projectConfig = (project: Project, layoutId?: string): CockpitConfig =>
  layoutConfig(project.library, project.cockpit, layoutId);

/**
 * Stores an edited configuration of the active layout: its cockpit design, if the project has
 * one, and its room. The design is kept even while the room leaves it out.
 */
export const recordProject = (project: Project, config: CockpitConfig): Project => ({
  ...project,
  cockpit: project.cockpit === null ? null : designOf(config),
  library: recordLayout(project.library, config),
});

/** A project from a single configuration, as v1 and v2 files and new projects have. */
export const projectFromConfig = (config: CockpitConfig, setup: SetupProgress): Project => ({
  cockpit: splitCockpit(config).cockpit,
  library: createLayoutLibrary(config),
  setup,
});

/** A new, empty project: only the room is shown until the guided setup adds more. */
export function createProject(): Project {
  const config = sanitize({
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
  });
  return projectFromConfig(config, { step: 'room', furthest: 0, deferred: [] });
}

/** Explicit v1 adapter: earlier projects always had a desk and a cockpit, and used cm. */
function readVersion1(data: RawRecord & { config: RawRecord }): Project {
  if (data.units && data.units !== 'cm') throw new Error('v1 designs use cm');
  const config = sanitize({
    ...data.config,
    deskEnabled: true,
    cockpitEnabled: true,
    monitorEnabled: true,
    keyboardEnabled: true,
    pcEnabled: true,
    mouseEnabled: true,
    matEnabled: true,
  });
  return projectFromConfig(config, completeSetup());
}

/** Progress saved with the retired cockpit step, as if the setup had always had four steps. */
function withoutCockpitStep(input: RawRecord): RawRecord {
  const { step, furthest, deferred } = input;
  return {
    ...input,
    step: step === RETIRED_COCKPIT_STEP ? 'complete' : step,
    furthest: typeof furthest === 'number' ? Math.min(furthest, LAST_STEP_INDEX) : furthest,
    deferred: Array.isArray(deferred)
      ? deferred.filter((id: unknown) => id !== RETIRED_COCKPIT_STEP)
      : deferred,
  };
}

function readSetup(rawInput: unknown, config: CockpitConfig): SetupProgress {
  const input = isRecord(rawInput) ? withoutCockpitStep(rawInput) : rawInput;
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

function readPresence(config: RawRecord): void {
  for (const key of PRESENCE_SETTINGS)
    if (typeof config[key] !== 'boolean') throw new Error('Invalid item presence');
}

/** A v2 file holds a single configuration, which opens as one layout. */
function readVersion2(data: RawRecord, rawConfig: RawRecord): Project {
  readPresence(rawConfig);
  const config = sanitize(rawConfig);
  return projectFromConfig(config, readSetup(data.setup, config));
}

type RawSpec = RawRecord & { id: string };

/** The shared furniture of a v3 file: records with unique ids, validated with each layout. */
function readFurnitureSpecs(input: unknown): RawSpec[] {
  if (!Array.isArray(input)) throw new Error('Invalid furniture');
  const ids = new Set<string>();
  return input.map((spec: unknown) => {
    if (!isPlainRecord(spec) || typeof spec.id !== 'string' || ids.has(spec.id))
      throw new Error('Invalid furniture id');
    ids.add(spec.id);
    return { ...spec, id: spec.id };
  });
}

const pickPlacement = (placement: RawRecord): RawRecord =>
  Object.fromEntries(
    FURNITURE_PLACEMENT_KEYS.filter((key) => key in placement).map((key) => [key, placement[key]]),
  );

function readLayoutEntry(
  input: unknown,
  shared: RawRecord,
  specs: RawSpec[],
  seenIds: Set<string>,
): LayoutEntry {
  if (!isPlainRecord(input) || typeof input.id !== 'string' || !LAYOUT_ID.test(input.id))
    throw new Error('Invalid layout id');
  if (seenIds.has(input.id)) throw new Error('Repeated layout id');
  seenIds.add(input.id);
  const { settings, furniture, hiddenFurniture } = input;
  if (!isPlainRecord(settings) || !isPlainRecord(furniture)) throw new Error('Invalid layout');
  for (const key of Object.keys(settings))
    if (!isLayoutSetting(key)) throw new Error(`Not a layout setting: ${key}`);
  const specIds = specs.map((spec) => spec.id);
  if (
    !Array.isArray(hiddenFurniture) ||
    !hiddenFurniture.every((id: unknown) => typeof id === 'string' && specIds.includes(id))
  )
    throw new Error('Invalid hidden furniture');
  const roomFurniture = specs.map((spec) => {
    const placement = furniture[spec.id];
    if (!isPlainRecord(placement)) throw new Error(`Missing placement of furniture ${spec.id}`);
    return { ...spec, ...pickPlacement(placement) };
  });
  const config = sanitize({ ...shared, ...settings, roomFurniture });
  if (config.roomFurniture.map((item) => item.id).join() !== specIds.join())
    throw new Error('Invalid furniture');
  return { id: input.id, name: input.name, config, hiddenFurniture };
}

/**
 * The room of a v3 or v4 file: the settings every layout shares, with the cockpit design among
 * them, and each layout's placements. Returns the project it describes. In a v3 file the design
 * exists only if the room includes it.
 */
function readRoom(
  shared: RawRecord,
  room: RawRecord,
  rawSetup: unknown,
  hasDesign = shared.cockpitEnabled === true,
): Project {
  const { layouts, activeLayoutId } = room;
  for (const key of Object.keys(shared))
    if (isLayoutSetting(key)) throw new Error(`Layout setting in the shared settings: ${key}`);
  readPresence(shared);
  if (!Array.isArray(layouts) || layouts.length === 0 || layouts.length > MAX_LAYOUTS)
    throw new Error('Invalid layouts');
  const specs = readFurnitureSpecs(shared.roomFurniture);
  const seenIds = new Set<string>();
  const entries = layouts.map((layout: unknown) => readLayoutEntry(layout, shared, specs, seenIds));
  if (typeof activeLayoutId !== 'string') throw new Error('Unknown active layout');
  const library = libraryFromLayouts(entries, activeLayoutId);
  // Every layout was read with the same design, so the first one has it.
  const cockpit = hasDesign ? designOf(entries[0].config) : null;
  return { cockpit, library, setup: readSetup(rawSetup, layoutConfig(library, cockpit)) };
}

/** A v3 file: the cockpit design is among the shared settings of the room. */
function readVersion3(data: RawRecord): Project {
  if (!isPlainRecord(data.shared)) throw new Error('Invalid configuration');
  return readRoom(data.shared, data, data.setup);
}

/** A v4 file: the cockpit design, or null, apart from the room and its layouts. */
function readVersion4(data: RawRecord): Project {
  const { cockpit, room } = data;
  if (cockpit !== null && !isPlainRecord(cockpit)) throw new Error('Invalid cockpit design');
  for (const key of Object.keys(cockpit ?? {}))
    if (!isCockpitDesignSetting(key)) throw new Error(`Not a cockpit setting: ${key}`);
  if (!isPlainRecord(room) || !isPlainRecord(room.shared)) throw new Error('Invalid room');
  for (const key of Object.keys(room.shared))
    if (isCockpitDesignSetting(key)) throw new Error(`Cockpit setting in the room: ${key}`);
  // Files saved before a room could leave the design out include it whenever there is one.
  const includesCockpit = room.shared.cockpitEnabled ?? cockpit !== null;
  if (includesCockpit === true && cockpit === null)
    throw new Error('The room includes a missing cockpit design');
  const shared = { ...room.shared, ...cockpit, cockpitEnabled: includesCockpit };
  return readRoom(shared, room, data.setup, cockpit !== null);
}

/**
 * Reads a project file (v1 to v4). `stored` skips the app check for the browser's own saved
 * copy. Throws a user-facing message when the file can't be used.
 */
export function readProject(data: unknown, { stored = false } = {}): Project {
  if (!isRecord(data) || (!stored && data.app !== 'Cockpit Lab'))
    throw new Error('File from another program');
  if (data.version === 3 || data.version === 4) {
    if (data.units !== 'cm') throw new Error('Unsupported version or units');
    return data.version === 4 ? readVersion4(data) : readVersion3(data);
  }
  const rawConfig = data.config;
  if (!isPlainRecord(rawConfig)) throw new Error('Invalid configuration');
  if (data.version === 1) return readVersion1({ ...data, config: rawConfig });
  if (data.version !== 2 || data.units !== 'cm') throw new Error('Unsupported version or units');
  return readVersion2(data, rawConfig);
}

export function projectData({ cockpit, library, setup }: Project): ProjectFile {
  return { app: 'Cockpit Lab', version: 4, units: 'cm', cockpit, room: library, setup };
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
