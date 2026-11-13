// The cockpit design: the frame, the driver and the controls, defined without any room. A project
// has at most one; the room links to it and each layout only places it. See docs/adr/0001.
import { defaults, type CockpitConfig } from './config.ts';

/** Settings that make up a cockpit design. Everything else belongs to the room or a layout. */
export const COCKPIT_DESIGN_KEYS = [
  'length',
  'width',
  'baseLift',
  'feet',
  'height',
  'seatZ',
  'seatH',
  'recline',
  'wheel',
  'wheelZ',
  'wheelH',
  'wheelTilt',
  'pedalZ',
  'pedalH',
  'pedalTilt',
  'hotas',
  'hotasZ',
  'hotasH',
  'hotasOut',
  'centerStick',
  'stickZ',
  'stickH',
  'shifter',
  'handbrake',
  'drivingSide',
  'preset',
] as const satisfies readonly (keyof CockpitConfig)[];

export type CockpitDesignKey = (typeof COCKPIT_DESIGN_KEYS)[number];
export type CockpitDesign = Pick<CockpitConfig, CockpitDesignKey>;
/**
 * The settings of a room and its layout, without a cockpit design. Its `cockpitEnabled` says
 * whether the room includes the project's design.
 */
export type RoomConfig = Omit<CockpitConfig, CockpitDesignKey>;

export const isCockpitDesignSetting = (key: string): boolean =>
  COCKPIT_DESIGN_KEYS.some((designKey) => designKey === key);

function separate(config: CockpitConfig): { design: CockpitDesign; room: RoomConfig } {
  const {
    length,
    width,
    baseLift,
    feet,
    height,
    seatZ,
    seatH,
    recline,
    wheel,
    wheelZ,
    wheelH,
    wheelTilt,
    pedalZ,
    pedalH,
    pedalTilt,
    hotas,
    hotasZ,
    hotasH,
    hotasOut,
    centerStick,
    stickZ,
    stickH,
    shifter,
    handbrake,
    drivingSide,
    preset,
    ...room
  } = config;
  const design = {
    length,
    width,
    baseLift,
    feet,
    height,
    seatZ,
    seatH,
    recline,
    wheel,
    wheelZ,
    wheelH,
    wheelTilt,
    pedalZ,
    pedalH,
    pedalTilt,
    hotas,
    hotasZ,
    hotasH,
    hotasOut,
    centerStick,
    stickZ,
    stickH,
    shifter,
    handbrake,
    drivingSide,
    preset,
  };
  return { design, room };
}

/** The cockpit design settings of a configuration, whether its room includes the cockpit or not. */
export const designOf = (config: CockpitConfig): CockpitDesign => separate(config).design;

/** The room settings of a configuration, including whether the room includes the cockpit. */
export const roomOf = (config: CockpitConfig): RoomConfig => separate(config).room;

/**
 * A single configuration as earlier files and new projects hold it: the cockpit design only
 * exists if the configuration includes it.
 */
export function splitCockpit(config: CockpitConfig): {
  cockpit: CockpitDesign | null;
  room: RoomConfig;
} {
  const { design, room } = separate(config);
  return { cockpit: config.cockpitEnabled ? design : null, room };
}

/** The settings a configuration without a cockpit keeps in the cockpit's place. */
const NO_COCKPIT = separate(defaults).design;

/** The cockpit settings of a configuration with this design, or with none. */
export const cockpitSettings = (
  cockpit: CockpitDesign | null,
): CockpitDesign & Pick<CockpitConfig, 'cockpitEnabled'> => ({
  ...(cockpit ?? NO_COCKPIT),
  cockpitEnabled: cockpit !== null,
});

/** Puts the project's cockpit design, or none, into the settings of a room that may include it. */
export const placeCockpit = (room: RoomConfig, cockpit: CockpitDesign | null): CockpitConfig => ({
  ...room,
  ...(cockpit ?? NO_COCKPIT),
  cockpitEnabled: room.cockpitEnabled && cockpit !== null,
});

/** What surrounds a design in its own workspace: nothing, with the cockpit at the origin. */
const NOTHING_AROUND: RoomConfig = {
  ...separate(defaults).room,
  cockpitEnabled: true,
  roomEnabled: false,
  deskEnabled: false,
  monitorEnabled: false,
  keyboardEnabled: false,
  pcEnabled: false,
  mouseEnabled: false,
  matEnabled: false,
  roomFeatures: [],
  roomFurniture: [],
  armPoses: [],
  cockpitX: 0,
  cockpitZ: 0,
  cockpitAngle: 0,
};

/** A configuration that shows a cockpit design, or none, without any room. */
export const designOnItsOwn = (cockpit: CockpitDesign | null): CockpitConfig =>
  placeCockpit(NOTHING_AROUND, cockpit);
