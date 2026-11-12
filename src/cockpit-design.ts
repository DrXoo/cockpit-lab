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
/** The settings of a room and its layout, without a cockpit design. */
export type RoomConfig = Omit<CockpitConfig, CockpitDesignKey | 'cockpitEnabled'>;

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
    cockpitEnabled: _present,
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

/** The cockpit design of a configuration, or null when it has no cockpit, and its room. */
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

/** Puts a cockpit design, or none, into the settings of a room. */
export const placeCockpit = (room: RoomConfig, cockpit: CockpitDesign | null): CockpitConfig => ({
  ...room,
  ...cockpitSettings(cockpit),
});
