// The Driver section of the cockpit editor's panel while fitting: the stature, the angles of
// the seated posture against their ranges, the reach warnings and the eye point.
import type {
  DoubledGrips,
  DriverAngle,
  DriverJoint,
  Driver,
  GripReach,
  SeatedDriver,
} from '../cad/driver/driver.ts';
import type { Hand } from '../cad/parts/assembly.ts';
import { MAX_STATURE_MM, MIN_STATURE_MM } from '../cad/driver/driver.ts';
import { round } from '../../shared/geometry.ts';
import { escapeHTML } from '../../ui/html.ts';
import { MM_PER_CM } from '../../shared/units.ts';

const JOINT_NAMES: Record<DriverJoint, string> = { knee: 'Knee', hip: 'Hip', elbow: 'Elbow' };
const HAND_NAMES: Record<Hand, string> = { left: 'left', right: 'right' };
const capitalized = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

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
  const grips = seated.reach.grips.length
    ? `<ul class="driver-angles" id="driverGrips">${seated.reach.grips.map(gripHTML).join('')}</ul>`
    : '';
  const doubled = seated.doubledGrips.map(doubledHTML).join('');
  const eye = `<p class="layout-hint" id="driverEye">Eye point ${round(seated.figure.eye.y, 0)} mm above the floor.</p>`;
  return `${stature}<ul class="driver-angles" id="driverAngles">${angles}</ul>${reach}${grips}${doubled}${eye}`;
}

function angleHTML({ joint, hand, angleDeg, range, verdict }: DriverAngle): string {
  const { mark, words } = VERDICT_TEXT[verdict];
  const level = verdict === 'within' ? 'ok' : 'warning';
  const name = hand
    ? `${capitalized(HAND_NAMES[hand])} ${JOINT_NAMES[joint].toLowerCase()}`
    : JOINT_NAMES[joint];
  const handAttribute = hand ? ` data-hand="${hand}"` : '';
  return `<li data-angle="${joint}"${handAttribute} class="driver-angle ${level}">${mark} ${name} ${round(angleDeg, 0)}°, ${words} ${range.minDeg}–${range.maxDeg}°</li>`;
}

/** A grip, and whether its hand is on it or reaches it: a symbol and words, not color alone. */
function gripHTML({ partId, name, hand, held, shortByMm }: GripReach): string {
  const reaches = shortByMm === 0;
  const peripheral = escapeHTML(name);
  const handName = HAND_NAMES[hand];
  // Rounded up, so a grip just out of reach never reads as 0 mm beyond it.
  const beyond = `${Math.ceil(shortByMm)} mm beyond`;
  const text = held
    ? `${capitalized(handName)} hand on ${peripheral}${reaches ? '' : `, ${beyond} its reach`}`
    : `${peripheral} ${reaches ? 'within' : beyond} reach of the ${handName} hand`;
  const level = reaches ? 'ok' : 'warning';
  return `<li data-grip="${escapeHTML(partId)}" class="driver-angle ${level}">${reaches ? '✓' : '⚠'} ${text}</li>`;
}

function doubledHTML({ hand, names }: DoubledGrips): string {
  const listed = names.map(escapeHTML);
  const last = listed.pop() ?? '';
  const all = listed.length ? `${listed.join(', ')} and ${last}` : last;
  return `<p class="layout-hint part-warning" data-doubled="${hand}">⚠ The ${HAND_NAMES[hand]} hand has more than one grip to hold, ${all}, and holds neither.</p>`;
}
