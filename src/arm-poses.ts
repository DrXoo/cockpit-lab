// Arm poses: named positions of the monitor arm that the user records and goes back to. A pose
// stores the joints themselves, so going back to it never works the angles out again.
import { clamp } from './geometry.ts';
import { fields, type ClampMount, type ClampSide, type CockpitConfig } from './config.ts';
import { monitorGeometry, wrapAngle } from './monitor-arm.ts';
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

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

function nextPoseId(poses: readonly ArmPose[]): string {
  const numbers = poses.map((pose) => Number(/^pose-(\d+)$/.exec(pose.id)?.[1] ?? 0));
  return `pose-${Math.max(0, ...numbers) + 1}`;
}

/**
 * Records the arm as it stands under `name`. A pose with the same name, ignoring case, is
 * recorded again in its place; otherwise the pose is added at the end.
 */
export function saveArmPose(s: CockpitConfig, name: unknown): CockpitConfig {
  const poses = s.armPoses;
  const cleanName = cleanUserText(name, `Pose ${poses.length + 1}`, MAX_ARM_POSE_NAME_LENGTH);
  const recorded = { ...currentJoints(s), mount: mountOf(s) };
  const existing = poses.find((pose) => sameName(pose.name, cleanName));
  if (existing)
    return {
      ...s,
      armPoses: poses.map((pose) => (pose === existing ? { ...pose, ...recorded } : pose)),
    };
  if (poses.length >= MAX_ARM_POSES) throw new Error('Arm pose limit reached');
  return {
    ...s,
    armPoses: [...poses, { id: nextPoseId(poses), name: cleanName, ...recorded }],
  };
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
