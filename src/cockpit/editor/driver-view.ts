// The Driver section of the cockpit editor's panel while fitting: the stature, the angles of
// the seated posture against their ranges, the reach warnings and the eye point.
import type { DriverAngle, DriverJoint, Driver, SeatedDriver } from '../cad/driver/driver.ts';
import { MAX_STATURE_MM, MIN_STATURE_MM } from '../cad/driver/driver.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import { MM_PER_CM } from '../../shared/units.ts';

const JOINT_NAMES: Record<DriverJoint, string> = { knee: 'Knee', hip: 'Hip', elbow: 'Elbow' };

/** How an angle sits against its range: a symbol and words, not color alone. */
const VERDICT_TEXT: Record<DriverAngle['verdict'], { mark: string; words: string }> = {
  within: { mark: '✓', words: 'within' },
  below: { mark: '⚠', words: 'tighter than' },
  above: { mark: '⚠', words: 'more open than' },
};

export function driverHTML(driver: Driver, seated: SeatedDriver): string {
  const stature = `<div class="control"><div class="control-top"><label for="driverStature">Stature</label><div class="number-wrap"><input id="driverStature" type="number" min="${MIN_STATURE_MM / MM_PER_CM}" max="${MAX_STATURE_MM / MM_PER_CM}" step="1" value="${round(driver.statureMm / MM_PER_CM, 1)}"><span>cm</span></div></div></div>`;
  if (seated.kind === 'unseated')
    return `${stature}<p class="layout-hint" id="driverUnseated">${escapeHTML(seated.reason)}</p>`;
  const angles = seated.angles.map(angleHTML).join('');
  const reach = [
    seated.reach.legs ? '' : 'The legs do not reach the pedals.',
    seated.reach.arms === false ? 'The arms do not reach the wheel.' : '',
  ]
    .filter(Boolean)
    .map((text) => `<p class="layout-hint part-warning">⚠ ${text}</p>`)
    .join('');
  const eye = `<p class="layout-hint" id="driverEye">Eye point ${round(seated.figure.eye.y, 0)} mm above the floor.</p>`;
  return `${stature}<ul class="driver-angles" id="driverAngles">${angles}</ul>${reach}${eye}`;
}

function angleHTML({ joint, angleDeg, range, verdict }: DriverAngle): string {
  const { mark, words } = VERDICT_TEXT[verdict];
  const level = verdict === 'within' ? 'ok' : 'warning';
  return `<li data-angle="${joint}" class="driver-angle ${level}">${mark} ${JOINT_NAMES[joint]} ${round(angleDeg, 0)}°, ${words} ${range.minDeg}–${range.maxDeg}°</li>`;
}
