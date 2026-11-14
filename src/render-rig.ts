// The cockpit rig as drawn: base, frame, seat, pedals, controls and the optional seated person.
// Local rig coordinates: +Y up, +Z towards the front, x = 0 on the rig's centre line.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad } from './geometry.ts';
import type { ParentRef, RenderList } from './render-list.ts';
import { drawCadProfiles } from './render-cad.ts';
import { drivingMount, rigLift } from './rig.ts';
import { resolveAssembly } from './cad/assembly.ts';
import { partsFromParametric } from './cad/from-parametric.ts';

type Body = NonNullable<CockpitEvaluation['body']>;

const QUARTER_TURN = Math.PI / 2;
/** The rig's end crossmembers are set back this much from each end. */
const END_INSET_CM = 10;
/** The pedal heads tilt back by this much to face the driver. */
const PEDAL_HEAD_TILT_DEG = 35;
/** Side mounts move back to make room for a shifter or handbrake on the same side. */
const SIDE_MOUNT_SHIFT_CM = 24;

export function drawRig(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { person }: { person: boolean },
): void {
  if (s.cockpitEnabled === false) return;
  drawFeet(r, parent, s);
  const assembly = r.group(parent, { position: [0, rigLift(s), 0] });
  // The profiles come from the CAD parts the design converts to, in cockpit coordinates.
  drawCadProfiles(r, parent, resolveAssembly(partsFromParametric(s)));
  drawFrameFittings(r, assembly, s);
  drawSeat(r, assembly, s);
  drawPedals(r, assembly, s);
  if (s.wheel) drawWheel(r, assembly, s);
  if (s.hotas) {
    const sharesSide = s.shifter || s.handbrake;
    for (const sign of [-1, 1])
      drawSideMount(
        r,
        assembly,
        sign,
        s,
        s.hotasZ + (sign === drivingMount(s).sign && sharesSide ? SIDE_MOUNT_SHIFT_CM : 0),
      );
  }
  if (s.shifter || s.handbrake) drawShifter(r, assembly, s);
  if (s.centerStick) drawCenterStick(r, assembly, s);
  if (person && e.body) drawPerson(r, assembly, s, e.body);
}

function drawFeet(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  for (const x of [-s.width / 2 + 2, s.width / 2 - 2]) {
    for (const z of [END_INSET_CM, s.length - END_INSET_CM]) {
      if (s.feet === 'casters') {
        const wheel = r.cylinder(3.3, 3.5, x, 3.4, z, 'rubber', parent);
        wheel.rotation = [0, 0, QUARTER_TURN];
        r.box(4, 2, 6, x, 6, z, 'dark', parent);
      } else {
        r.cylinder(3.6, 2, x, 1.4, z, 'rubber', parent);
        r.cylinder(0.6, 4, x, 4, z, 'silver', parent);
      }
    }
  }
}

/** The brackets at the foot of the seat posts and the seat's rails. */
function drawFrameFittings(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  const w = s.width;
  for (const z of [s.seatZ - 12, s.seatZ + 18])
    for (const x of [-w / 2 + 8, w / 2 - 8]) r.box(5, 5, 0.5, x, 16, z + 2.2, 'orange', parent);
  for (const x of [-18, 18]) r.box(3, 2.2, 40, x, s.seatH - 6, s.seatZ + 3, 'dark', parent);
}

function drawSeat(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  const y = s.seatH;
  const z = s.seatZ;
  r.box(48, 8, 42, 0, y - 4, z + 3, 'seat', parent);
  r.box(34, 2.5, 34, 0, y + 0.8, z + 5, 'fabric', parent);
  for (const x of [-22, 22]) {
    const bolster = r.box(6, 10, 36, x, y + 1, z + 2, 'seat', parent);
    bolster.rotation = [0, 0, degToRad(x > 0 ? -8 : 8)];
    r.tube([x, y + 6, z - 12], [x, y + 6, z + 18], 0.22, 'orange', parent);
  }
  const back = r.group(parent, {
    position: [0, y, z - 12],
    rotation: [-degToRad(s.recline), 0, 0],
  });
  r.box(46, 49, 8, 0, 24.5, 0, 'seat', back);
  r.box(33, 36, 3, 0, 22, 4.7, 'fabric', back);
  for (const x of [-21, 21]) {
    const wing = r.box(8, 40, 13, x, 26, 2, 'seat', back);
    wing.rotation = [0, 0, degToRad(x > 0 ? 5 : -5)];
    r.tube([x, 8, 8], [x, 45, 8], 0.23, 'orange', back);
  }
  for (const x of [-8, 8]) r.cylinder(0.6, 8, x, 51, 0, 'silver', back);
  r.box(27, 14, 9, 0, 57, 0, 'seat', back);
  r.box(21, 9, 1, 0, 57, 5, 'fabric', back);
  for (const x of [-24, 24]) {
    const screw = r.cylinder(2, 1, x, y - 4, z - 12, 'silver', parent);
    screw.rotation = [0, 0, QUARTER_TURN];
  }
}

function drawPedals(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  const w = s.width;
  const deck = r.group(parent, {
    position: [0, s.pedalH, s.pedalZ],
    rotation: [-degToRad(s.pedalTilt), 0, 0],
  });
  r.box(w - 8, 1.1, 38, 0, 0, 0, 'dark', deck, true);
  // The driver sits at -Z, so the contact face is the head's -Z face. The heads tilt back
  // to offset the deck's 0…35° tilt, so they face the driver and up.
  for (const x of [-15, 0, 15]) {
    r.box(7, 2, 22, x, 2, 0, 'dark', deck);
    const pivot = r.cylinder(1.5, 7, x, 3, 9, 'dark', deck);
    pivot.rotation = [0, 0, QUARTER_TURN];
    r.tube([x, 3, 9], [x, 9, 3], 1, 'silver', deck);
    const head = r.group(deck, {
      position: [x, 12, 5],
      rotation: [degToRad(PEDAL_HEAD_TILT_DEG), 0, 0],
    });
    r.box(7, 11, 1.2, 0, 0, 0, 'silver', head, true);
    // Grip strips belong to the contact face and follow the same inclination.
    for (const y of [-3, 0, 3]) r.box(4.8, 0.4, 0.3, 0, y, -0.7, 'groove', head);
  }
}

function drawWheel(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  for (const x of [-s.width / 2 + 2, s.width / 2 - 2]) {
    r.box(7, 10, 0.8, x, 21, s.wheelZ + 20.5, 'orange', parent);
  }
  const pivot = r.group(parent, {
    position: [0, s.wheelH, s.wheelZ],
    rotation: [-degToRad(s.wheelTilt), 0, 0],
  });
  const mount = r.group(pivot, { position: [0, 0, 13] });
  r.box(s.width - 8, 1.3, 22, 0, -9, 5, 'dark', mount);
  for (const x of [-s.width / 2 + 7, s.width / 2 - 7])
    r.box(0.8, 8, 19, x, -4.5, 5, 'orange', mount);
  r.box(15, 12, 18, 0, -1, 7, 'dark', mount, true);
  for (const x of [-7.7, 7.7])
    for (const y of [-3, 0, 3]) r.box(0.15, 0.6, 14, x, y, 7, 'groove', mount);
  r.tube([0, 0, -1], [0, 0, -12], 2, 'silver', mount);
  r.torus(14.5, 1.65, [0, 0, -13], 'rubber', mount, { radialSegments: 10, tubularSegments: 48 });
  r.box(14, 7, 2, 0, 0, -13, 'dark', mount);
  r.tube([-12, 2, -13], [0, 0, -13], 1.1, 'silver', mount);
  r.tube([12, 2, -13], [0, 0, -13], 1.1, 'silver', mount);
  r.tube([0, -13, -13], [0, -1, -13], 1, 'silver', mount);
  r.box(2, 3, 0.4, 0, 13.3, -14.2, 'orange', mount);
  for (const x of [-4.5, 4.5])
    for (const y of [-1.5, 1.5]) r.sphere(0.6, x, y, -14.3, y > 0 ? 'orange' : 'silver', mount);
}

/** A HOTAS plate on one side: the joystick on the pilot's right (-1), the throttle on the left. */
function drawSideMount(
  r: RenderList,
  parent: ParentRef,
  sign: number,
  s: CockpitConfig,
  z: number,
) {
  const x = sign * (s.width / 2 + s.hotasOut);
  r.box(18, 1, 25, x, s.hotasH, z, 'orange', parent);
  r.box(16, 1, 23, x, s.hotasH + 0.8, z, 'dark', parent);
  if (sign === -1) drawJoystick(r, parent, x, s.hotasH + 2, z);
  else {
    r.box(12, 5, 18, x, s.hotasH + 4, z, 'dark', parent);
    r.tube([x, s.hotasH + 7, z - 3], [x, s.hotasH + 12, z + 2], 1.5, 'dark', parent);
    r.box(12, 4, 6, x, s.hotasH + 12, z + 2, 'rubber', parent);
  }
}

function drawJoystick(r: RenderList, parent: ParentRef, x: number, y: number, z: number) {
  r.box(11, 3, 13, x, y + 1, z, 'dark', parent);
  r.cylinder(2, 4, x, y + 4, z, 'rubber', parent);
  r.tube([x, y + 5, z], [x, y + 16, z - 2], 1.8, 'dark', parent);
  r.sphere(2.9, x, y + 17, z - 2, 'dark', parent);
  r.box(5, 2, 4, x, y + 19, z - 2, 'dark', parent);
  r.sphere(0.7, x + 2, y + 19, z - 4, 'orange', parent);
}

function drawShifter(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  const { sign, x, z } = drivingMount(s);
  const inner = x - sign * 3;
  const outer = x + sign * 5;
  r.box(20, 1, 30, x, s.hotasH, z, 'orange', parent);
  if (s.shifter) {
    r.box(10, 7, 12, inner, s.hotasH + 4, z - 5, 'dark', parent);
    r.cylinder(0.8, 11, inner, s.hotasH + 13, z - 5, 'silver', parent);
    r.sphere(2.8, inner, s.hotasH + 19, z - 5, 'dark', parent);
  }
  if (s.handbrake) {
    r.box(5, 5, 12, outer, s.hotasH + 3, z + 6, 'dark', parent);
    r.tube([outer, s.hotasH + 5, z + 6], [outer, s.hotasH + 22, z + 10], 1.2, 'silver', parent);
    r.tube([outer, s.hotasH + 16, z + 8], [outer, s.hotasH + 25, z + 11], 1.7, 'rubber', parent);
  }
}

function drawCenterStick(r: RenderList, parent: ParentRef, s: CockpitConfig) {
  r.box(18, 0.8, 20, 0, s.stickH, s.stickZ, 'orange', parent);
  drawJoystick(r, parent, 0, s.stickH + 1, s.stickZ);
}

/** A mannequin from the posture model, to check reach and clearances by eye. */
function drawPerson(r: RenderList, parent: ParentRef, s: CockpitConfig, b: Body) {
  const { hip, shoulder } = b;
  r.tube([0, hip.y + 5, hip.z], [0, shoulder.y - 3, shoulder.z], 10, 'blue', parent);
  r.sphere(8, 0, b.eye.y, b.eye.z, 'blue', parent);
  r.box(17, 9, 9, 0, b.eye.y, b.eye.z + 6, 'dark', parent);
  for (const x of [-12, 12]) {
    r.sphere(4, x, hip.y, hip.z, 'blue', parent);
    r.tube([x, hip.y, hip.z], [x, b.legs.joint.y, b.legs.joint.z], 4.7, 'blue', parent);
    r.tube([x, b.legs.joint.y, b.legs.joint.z], [x, b.foot.y, b.foot.z], 3.5, 'blue', parent);
    r.box(8, 5, 18, x, b.foot.y - 2, b.foot.z + 3, 'blue', parent);
    if (s.wheel && b.hands) {
      const elbow = b.hands.arms.joint;
      const hand = b.hands.point;
      r.tube([x, shoulder.y, shoulder.z], [x * 1.4, elbow.y, elbow.z], 3.2, 'blue', parent);
      r.tube([x * 1.4, elbow.y, elbow.z], [x * 1.1, hand.y, hand.z], 2.6, 'blue', parent);
    } else {
      // Without a wheel the hands rest on the side controls.
      const elbow = { y: shoulder.y - 25, z: shoulder.z + 12 };
      r.tube([x, shoulder.y, shoulder.z], [x * 1.7, elbow.y, elbow.z], 3.2, 'blue', parent);
      r.tube([x * 1.7, elbow.y, elbow.z], [x * 2.5, s.hotasH + 18, s.hotasZ], 2.6, 'blue', parent);
    }
  }
}
