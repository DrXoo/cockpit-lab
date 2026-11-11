import { clamp, degToRad, transformPoint, type PlanPoint } from './geometry.ts';
import type { CockpitConfig, MonitorMode, ArmBend } from './config.ts';
import { pose } from './layout.ts';

// Planar two-link monitor arm. Angles follow the desk's Y rotation convention.
/** Wraps an angle in degrees to [-180, 180). */
export const wrapAngle = (angle: number): number => ((((angle + 180) % 360) + 360) % 360) - 180;

export function armKinematics(
  s: CockpitConfig,
  anchor: PlanPoint,
  target: PlanPoint | null = null,
) {
  const first = (s.armReach * (s.armSplit ?? 50)) / 100,
    second = s.armReach - first,
    minReach = Math.abs(first - second),
    maxReach = first + second;
  let baseAngle = s.armBaseAngle ?? 0,
    elbowAngle = s.armElbowAngle ?? 0,
    reachable = true;
  if (target) {
    const dx = target.x - anchor.x,
      dz = target.z - anchor.z,
      d = Math.hypot(dx, dz),
      safe = clamp(d, minReach, maxReach);
    reachable = d >= minReach - 1e-7 && d <= maxReach + 1e-7;
    const bend = s.armBend === 'negative' ? -1 : 1,
      theta =
        bend *
        Math.acos(
          clamp((safe * safe - first * first - second * second) / (2 * first * second), -1, 1),
        );
    const heading = d > 1e-8 ? Math.atan2(-dz, dx) : degToRad(s.deskAngle + baseAngle);
    baseAngle = wrapAngle(
      ((heading - Math.atan2(second * Math.sin(theta), first + second * Math.cos(theta))) /
        Math.PI) *
        180 -
        s.deskAngle,
    );
    elbowAngle = (theta / Math.PI) * 180;
  }
  const a = degToRad(s.deskAngle + baseAngle),
    b = a + degToRad(elbowAngle),
    y = s.monitorH;
  const base = { x: anchor.x, y, z: anchor.z },
    elbow = { x: base.x + first * Math.cos(a), y, z: base.z - first * Math.sin(a) },
    end = { x: elbow.x + second * Math.cos(b), y, z: elbow.z - second * Math.sin(b) };
  return { base, elbow, end, first, second, minReach, maxReach, baseAngle, elbowAngle, reachable };
}
export function monitorGeometry(s: CockpitConfig) {
  const anchor = transformPoint({ x: s.clampX, z: s.clampZ, y: s.deskH }, pose(s, 'desk'));
  const mode = s.cockpitEnabled === false && s.monitorMode === 'cockpit' ? 'desk' : s.monitorMode;
  const target =
    mode === 'manual'
      ? null
      : mode === 'cockpit'
        ? transformPoint({ x: 0, z: s.wheelZ + s.monitorAhead, y: s.monitorH }, pose(s, 'cockpit'))
        : transformPoint({ x: -10, z: 0, y: s.monitorH }, pose(s, 'desk'));
  const arm = armKinematics(s, anchor, target),
    point = target ?? arm.end,
    angle =
      mode === 'manual'
        ? s.deskAngle + s.monitorYaw
        : mode === 'cockpit'
          ? s.cockpitAngle
          : s.deskAngle + 90;
  return { anchor, arm, point, angle };
}
export function setMonitorMode(s: CockpitConfig, mode: MonitorMode): CockpitConfig {
  if (mode !== 'manual' || s.monitorMode === 'manual') return { ...s, monitorMode: mode };
  const g = monitorGeometry(s);
  return {
    ...s,
    monitorMode: 'manual',
    armBaseAngle: g.arm.baseAngle,
    armElbowAngle: g.arm.elbowAngle,
    monitorYaw: wrapAngle(g.angle - s.deskAngle),
  };
}
/** Edits one arm setting. Changing an angle by hand switches the monitor to manual mode. */
export function editArm(s: CockpitConfig, key: string, value: unknown): CockpitConfig {
  if (key === 'monitorMode') return setMonitorMode(s, value as MonitorMode);
  if (key === 'armBend') {
    const next = { ...s, armBend: value as ArmBend };
    if (next.monitorMode === 'manual')
      next.armElbowAngle = Math.abs(next.armElbowAngle) * (value === 'negative' ? -1 : 1);
    return next;
  }
  if (key !== 'armBaseAngle' && key !== 'armElbowAngle' && key !== 'monitorYaw') return s;
  const angle = value as number;
  const next = setMonitorMode(s, 'manual');
  next[key] = angle;
  if (key === 'armElbowAngle') next.armBend = angle < 0 ? 'negative' : 'positive';
  return next;
}
export function moveArmJoint(
  s: CockpitConfig,
  joint: 'elbow' | 'end',
  x: number,
  z: number,
): CockpitConfig {
  const next = setMonitorMode(s, 'manual'),
    g = monitorGeometry(next);
  if (joint === 'elbow') {
    next.armBaseAngle = wrapAngle(
      (Math.atan2(g.anchor.z - z, x - g.anchor.x) * 180) / Math.PI - s.deskAngle,
    );
  } else {
    const arm = armKinematics(next, g.anchor, { x, z });
    next.armBaseAngle = arm.baseAngle;
    next.armElbowAngle = arm.elbowAngle;
  }
  return next;
}
