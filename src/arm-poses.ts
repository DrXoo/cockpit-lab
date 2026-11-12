// Arm poses: named positions of the monitor arm that the user records and goes back to. A pose
// stores the joints themselves, so going back to it never works the angles out again.
import { clamp } from './geometry.ts';
import {
  fields,
  type ClampMount,
  type ClampSide,
  type CockpitConfig,
  type MonitorMode,
} from './config.ts';
import { monitorGeometry, setMonitorMode, wrapAngle } from './monitor-arm.ts';
import { cleanUserText } from './user-text.ts';

export const MAX_ARM_POSES = 12;
export const MAX_ARM_POSE_NAME_LENGTH = 40;

/** Joint values closer than this, in degrees or cm, are the same pose. */
const SAME_POSE_TOLERANCE = 1e-6;
const ARM_POSE_ID = /^[a-z0-9-]{1,50}$/i;
const CLAMP_MOUNTS: readonly ClampMount[] = ['clamp', 'grommet'];
const CLAMP_SIDES: readonly ClampSide[] = ['xmin', 'xmax', 'zmin', 'zmax'];

/** Where the arm was fixed to the desktop when the pose was saved. */
export interface ArmMount {
  clampMount: ClampMount;
  clampSide: ClampSide;
  clampX: number;
  clampZ: number;
}

const JOINT_KEYS = ['armBaseAngle', 'armElbowAngle', 'monitorYaw', 'monitorH'] as const;
const MOUNT_POSITION_KEYS = ['clampX', 'clampZ'] as const;

type ArmJoints = Pick<CockpitConfig, (typeof JOINT_KEYS)[number]>;

export interface ArmPose extends ArmJoints {
  id: string;
  name: string;
  mount: ArmMount;
}

const mountOf = (s: CockpitConfig): ArmMount => ({
  clampMount: s.clampMount,
  clampSide: s.clampSide,
  clampX: s.clampX,
  clampZ: s.clampZ,
});

/** The joints as the arm stands now, whichever mode placed it. */
function currentJoints(s: CockpitConfig): ArmJoints {
  const g = monitorGeometry(s);
  return {
    armBaseAngle: g.arm.baseAngle,
    armElbowAngle: g.arm.elbowAngle,
    monitorYaw: wrapAngle(g.angle - s.deskAngle),
    monitorH: s.monitorH,
  };
}

/** What a pose stores about the arm as it stands now. */
const recordedArm = (s: CockpitConfig): ArmJoints & { mount: ArmMount } => ({
  ...currentJoints(s),
  mount: mountOf(s),
});

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function nextPoseId(poses: readonly ArmPose[]): string {
  const numbers = poses.map((pose) => Number(/^pose-(\d+)$/.exec(pose.id)?.[1] ?? 0));
  return `pose-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Records the arm as it stands under `name`, and holds the arm in that pose. A pose with the same
 * name, ignoring case, is recorded again in its place; otherwise the pose is added at the end.
 */
export function saveArmPose(s: CockpitConfig, name: unknown): CockpitConfig {
  const poses = s.armPoses;
  const cleanName = cleanUserText(name, `Pose ${poses.length + 1}`, MAX_ARM_POSE_NAME_LENGTH);
  const existing = poses.find((pose) => sameName(pose.name, cleanName));
  if (existing) return updateArmPose(s, existing.id);
  if (poses.length >= MAX_ARM_POSES) throw new Error('Arm pose limit reached');
  const id = nextPoseId(poses);
  const saved = { ...s, armPoses: [...poses, { id, name: cleanName, ...recordedArm(s) }] };
  return applyArmPose(saved, id);
}

function armPoseById(s: CockpitConfig, id: string): ArmPose {
  const pose = s.armPoses.find((candidate) => candidate.id === id);
  if (!pose) throw new Error(`Unknown arm pose: ${id}`);
  return pose;
}

/** Puts the arm in the pose's joints, in manual mode. The mount stays where it is. */
export function applyArmPose(s: CockpitConfig, id: string): CockpitConfig {
  const pose = armPoseById(s, id);
  return {
    ...s,
    monitorMode: 'manual',
    armBaseAngle: pose.armBaseAngle,
    armElbowAngle: pose.armElbowAngle,
    armBend: pose.armElbowAngle < 0 ? 'negative' : 'positive',
    monitorYaw: pose.monitorYaw,
    monitorH: pose.monitorH,
  };
}

/** Records the arm as it stands into an existing pose, keeping its name and place, and holds the arm in it. */
export function updateArmPose(s: CockpitConfig, id: string): CockpitConfig {
  const target = armPoseById(s, id);
  const recorded = recordedArm(s);
  const updated = {
    ...s,
    armPoses: s.armPoses.map((pose) => (pose === target ? { ...pose, ...recorded } : pose)),
  };
  return applyArmPose(updated, id);
}

export function deleteArmPose(s: CockpitConfig, id: string): CockpitConfig {
  armPoseById(s, id);
  return { ...s, armPoses: s.armPoses.filter((pose) => pose.id !== id) };
}

/** The saved pose the arm is in now, if any. */
export function activeArmPose(s: CockpitConfig): ArmPose | undefined {
  if (s.monitorMode !== 'manual') return undefined;
  return s.armPoses.find((pose) =>
    JOINT_KEYS.every((key) => Math.abs(pose[key] - s[key]) < SAME_POSE_TOLERANCE),
  );
}

/** True when the arm is fixed elsewhere on the desktop than when the pose was saved. */
export function armPoseMountMoved(s: CockpitConfig, pose: ArmPose): boolean {
  const now = mountOf(s);
  return (
    now.clampMount !== pose.mount.clampMount ||
    now.clampSide !== pose.mount.clampSide ||
    MOUNT_POSITION_KEYS.some((key) => Math.abs(now[key] - pose.mount[key]) >= SAME_POSE_TOLERANCE)
  );
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function invalid(): never {
  throw new Error('Invalid arm pose');
}

function readSetting<K extends (typeof JOINT_KEYS)[number] | (typeof MOUNT_POSITION_KEYS)[number]>(
  raw: Record<string, unknown>,
  key: K,
): number {
  const value = raw[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid();
  const [min, max] = fields[key];
  return clamp(value, min, max);
}

function readChoice<T extends string>(value: unknown, allowed: readonly T[]): T {
  const match = allowed.find((option) => option === value);
  if (match === undefined) invalid();
  return match;
}

function readMount(raw: unknown): ArmMount {
  if (!isRecord(raw)) invalid();
  return {
    clampMount: readChoice(raw.clampMount, CLAMP_MOUNTS),
    clampSide: readChoice(raw.clampSide, CLAMP_SIDES),
    clampX: readSetting(raw, 'clampX'),
    clampZ: readSetting(raw, 'clampZ'),
  };
}

function readArmPose(raw: unknown): ArmPose {
  if (!isRecord(raw) || typeof raw.id !== 'string' || !ARM_POSE_ID.test(raw.id)) invalid();
  return {
    id: raw.id,
    name: cleanUserText(raw.name, 'Pose', MAX_ARM_POSE_NAME_LENGTH),
    armBaseAngle: readSetting(raw, 'armBaseAngle'),
    armElbowAngle: readSetting(raw, 'armElbowAngle'),
    monitorYaw: readSetting(raw, 'monitorYaw'),
    monitorH: readSetting(raw, 'monitorH'),
    mount: readMount(raw.mount),
  };
}

/** Validates saved poses: angles are clamped to their range, anything else invalid is rejected. */
export function readArmPoses(raw: unknown): ArmPose[] {
  if (!Array.isArray(raw) || raw.length > MAX_ARM_POSES) invalid();
  const poses = raw.map(readArmPose);
  if (new Set(poses.map((pose) => pose.id)).size !== poses.length) invalid();
  return poses;
}

/** The automatic monitor modes, which work the joints out towards a target. */
export const AUTOMATIC_MONITOR_MODES = [
  'cockpit',
  'desk',
  'vr',
] as const satisfies readonly MonitorMode[];
type AutomaticMonitorMode = (typeof AUTOMATIC_MONITOR_MODES)[number];

/**
 * A choice of the monitor position: a saved pose (`pose:<id>`), an automatic mode
 * (`auto:<mode>`) or the current joints when they match no pose (`custom`).
 */
export type MonitorPositionChoice = `pose:${string}` | `auto:${AutomaticMonitorMode}` | 'custom';

export interface MonitorPosition {
  choice: MonitorPositionChoice;
  /** The arm has moved since the chosen pose was saved or applied. */
  changed: boolean;
}

/**
 * What the monitor position shows. `selectedPoseId` is the pose last chosen, saved or updated:
 * once the arm moves away from it, it is still shown, as changed, so it can be updated.
 */
export function monitorPositionOf(s: CockpitConfig, selectedPoseId: string): MonitorPosition {
  const automatic = AUTOMATIC_MONITOR_MODES.find((mode) => mode === s.monitorMode);
  if (automatic) return { choice: `auto:${automatic}`, changed: false };
  const active = activeArmPose(s);
  if (active) return { choice: `pose:${active.id}`, changed: false };
  if (s.armPoses.some((pose) => pose.id === selectedPoseId))
    return { choice: `pose:${selectedPoseId}`, changed: true };
  return { choice: 'custom', changed: false };
}

/** Applies a choice of the monitor position. */
export function chooseMonitorPosition(s: CockpitConfig, choice: string): CockpitConfig {
  if (choice === 'custom') return setMonitorMode(s, 'manual');
  if (choice.startsWith('pose:')) return applyArmPose(s, choice.slice('pose:'.length));
  const automatic = AUTOMATIC_MONITOR_MODES.find((mode) => `auto:${mode}` === choice);
  if (!automatic) throw new Error(`Unknown monitor position: ${choice}`);
  return setMonitorMode(s, automatic);
}
