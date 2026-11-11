// Guided setup: what each step does to the project and when the user can move on.
import { advanceSetup, type SetupProgress, type SetupStep } from './project.ts';
import { presets, type CockpitConfig, type PresetId } from './config.ts';
import { resizeDesk } from './desk.ts';
import { normalizeRoom } from './room.ts';
import { roomItems } from './room-editor.ts';

export type SettingsSection = 'room' | 'desk' | 'rig';

/** The settings section a guided step opens. */
export const sectionOfStep = (step: SetupStep): SettingsSection =>
  step === 'room' || step === 'openings' || step === 'furniture'
    ? 'room'
    : step === 'desk'
      ? 'desk'
      : 'rig';

/** Step 1: the interior size of the room, in cm. */
export const withRoomSize = (
  state: CockpitConfig,
  width: number,
  depth: number,
  height: number,
): CockpitConfig =>
  normalizeRoom({ ...state, roomEnabled: true, roomW: width, roomD: depth, roomH: height });

/** Step 4: the desk, placed in the middle of the room with the monitor on it. */
export const withDesk = (
  state: CockpitConfig,
  width: number,
  depth: number,
  height: number,
): CockpitConfig =>
  resizeDesk(
    {
      ...state,
      deskEnabled: true,
      deskH: height,
      deskX: state.roomX + state.roomW / 2,
      deskZ: state.roomZ + state.roomD / 2,
      monitorMode: 'desk',
    },
    width,
    depth,
  );

/** Step 5: the cockpit from a preset, centred across the room and along its depth. */
export function withCockpitPreset(state: CockpitConfig, preset: PresetId): CockpitConfig {
  const values = presets[preset].values;
  return {
    ...state,
    ...values,
    preset,
    cockpitEnabled: true,
    cockpitX: state.roomX + state.roomW / 2,
    cockpitZ: state.roomZ + Math.max(0, (state.roomD - values.length) / 2),
  };
}

export interface SetupButtons {
  backDisabled: boolean;
  nextLabel: string;
  nextDisabled: boolean;
  skipHidden: boolean;
  skipLabel: string;
}

export function setupButtons(setup: SetupProgress, state: CockpitConfig): SetupButtons {
  const { step } = setup;
  const canDefer =
    step === 'openings' ||
    step === 'furniture' ||
    (step === 'desk' && !state.deskEnabled) ||
    (step === 'cockpit' && !state.cockpitEnabled);
  return {
    backDisabled: step === 'room',
    nextLabel: step === 'cockpit' ? 'Terminar' : 'Continuar',
    nextDisabled:
      step === 'desk' ? !state.deskEnabled : step === 'cockpit' ? !state.cockpitEnabled : false,
    skipHidden: !canDefer,
    skipLabel: step === 'desk' ? 'No necesito mesa' : 'Añadir después',
  };
}

export type ContinueResult =
  | { status: 'needs-room' }
  | { status: 'blocked' }
  | { status: 'advanced'; setup: Omit<SetupProgress, 'drafts'> };

/**
 * Moves to the next step. The room is required; the desk and the cockpit can be skipped
 * with `defer`. An openings or furniture step left empty is kept to revisit.
 */
export function nextSetupStep(
  setup: SetupProgress,
  state: CockpitConfig,
  { defer = false } = {},
): ContinueResult {
  const { step } = setup;
  if (step === 'room' && !state.roomEnabled) return { status: 'needs-room' };
  if (step === 'desk' && !state.deskEnabled && !defer) return { status: 'blocked' };
  if (step === 'cockpit' && !state.cockpitEnabled && !defer) return { status: 'blocked' };
  const empty =
    (step === 'openings' || step === 'furniture') && roomItems(state, step).length === 0;
  return { status: 'advanced', setup: advanceSetup(setup, { defer: defer || empty }) };
}
