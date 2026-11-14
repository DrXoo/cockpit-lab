// The cockpit rig as drawn: base, frame, seat, pedals, controls and the optional seated person.
// Every part is drawn where the CAD design the cockpit converts to puts it, in cockpit
// coordinates: +Y up, +Z towards the front, x = 0 on the rig's centre line.
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { degToRad } from './geometry.ts';
import type { ParentRef, RenderList } from './render-list.ts';
import { drawCadProfiles } from './render-cad.ts';
import { rigLift } from './rig.ts';
import { partPointMm, type ResolvedPart } from './cad/assembly.ts';
import { MM_PER_CM } from './units.ts';

type Body = NonNullable<CockpitEvaluation['body']>;
type Design = ReadonlyMap<string, ResolvedPart>;
interface OffsetCm {
  x: number;
  y: number;
  z: number;
}

const QUARTER_TURN = Math.PI / 2;
/** The pedal heads tilt back by this much to face the driver. */
const PEDAL_HEAD_TILT_DEG = 35;
/** The seat is drawn from the top of its cushion, this far below the hip point. */
const SEAT_DRAWING_BELOW_HIP_CM = 4;
/** The seat post brackets sit at this height above the base. */
const POST_BRACKET_HEIGHT_CM = 16;
/** The wheel plate's center in the drawing of the wheel mount. */
const WHEEL_PLATE_IN_MOUNT_CM = { y: -9, z: 5 };
const ORIGIN: OffsetCm = { x: 0, y: 0, z: 0 };

const cm = (mm: number): number => mm / MM_PER_CM;

function partIn(design: Design, id: string): ResolvedPart {
  const part = design.get(id);
  if (!part) throw new Error(`The cockpit design has no part ${id} to draw.`);
  return part;
}

const centerCm = ({ box }: ResolvedPart) => ({
  x: cm((box.min.x + box.max.x) / 2),
  z: cm((box.min.z + box.max.z) / 2),
});

/** A group at a point of a plate or peripheral, from its mounting origin, turned with it. */
function groupOn(r: RenderList, parent: ParentRef, part: ResolvedPart, offsetCm = ORIGIN) {
  const point = partPointMm(part, {
    x: offsetCm.x * MM_PER_CM,
    y: offsetCm.y * MM_PER_CM,
    z: offsetCm.z * MM_PER_CM,
  });
  return r.group(parent, {
    position: [cm(point.x), cm(point.y), cm(point.z)],
    rotation: [part.tiltDeg === 0 ? 0 : -degToRad(part.tiltDeg), 0, 0],
  });
}

const heightCm = ({ box }: ResolvedPart): number => cm(box.max.y - box.min.y);

/** A group at the center of a plate, half its thickness above its underside. */
const plateCenter = (r: RenderList, parent: ParentRef, plate: ResolvedPart) =>
  groupOn(r, parent, plate, { x: 0, y: heightCm(plate) / 2, z: 0 });

export function drawRig(
  r: RenderList,
  parent: ParentRef,
  s: CockpitConfig,
  e: CockpitEvaluation,
  { person }: { person: boolean },
): void {
  if (s.cockpitEnabled === false) return;
  const design = e.design;
  const part = (id: string) => partIn(design, id);
  drawFeet(r, parent, design);
  const assembly = r.group(parent, { position: [0, rigLift(s), 0] });
  drawCadProfiles(r, parent, design);
  drawPostBrackets(r, parent, design, rigLift(s));
  drawSeat(r, parent, part('seat'), s.recline);
  drawPedals(r, plateCenter(r, parent, part('pedal-plate')), part('pedal-plate'));
  if (s.wheel) drawWheel(r, parent, design);
  if (s.hotas) {
    drawSideMount(r, plateCenter(r, parent, part('hotas-plate-right')), 'joystick');
    drawSideMount(r, plateCenter(r, parent, part('hotas-plate-left')), 'throttle');
  }
  if (s.shifter || s.handbrake) drawShifter(r, parent, design);
  if (s.centerStick) drawCenterStick(r, plateCenter(r, parent, part('center-stick-plate')));
  if (person && e.body) drawPerson(r, assembly, s, e.body);
}

function drawFeet(r: RenderList, parent: ParentRef, design: Design) {
  for (const foot of design.values()) {
    if (foot.part.kind !== 'foot') continue;
    const { x, z } = centerCm(foot);
    if (foot.part.footTypeId === 'locking-caster') {
      const wheel = r.cylinder(3.3, 3.5, x, 3.4, z, 'rubber', parent);
      wheel.rotation = [0, 0, QUARTER_TURN];
      r.box(4, 2, 6, x, 6, z, 'dark', parent);
    } else {
      r.cylinder(3.6, 2, x, 1.4, z, 'rubber', parent);
      r.cylinder(0.6, 4, x, 4, z, 'silver', parent);
    }
  }
}

/** The brackets at the foot of the seat posts. */
function drawPostBrackets(r: RenderList, parent: ParentRef, design: Design, liftCm: number) {
  for (const post of design.values()) {
    if (!post.part.id.startsWith('seat-post-')) continue;
    const { x, z } = centerCm(post);
    r.box(5, 5, 0.5, x, liftCm + POST_BRACKET_HEIGHT_CM, z + 2.2, 'orange', parent);
  }
}

/** The seat, its rails and its reclined backrest, drawn from the top of the cushion. */
function drawSeat(r: RenderList, parent: ParentRef, seat: ResolvedPart, reclineDeg: number) {
  if (seat.part.kind !== 'peripheral') throw new Error('The seat must be a peripheral.');
  const hip = seat.part.contactPoints.find((contact) => contact.role === 'hip');
  if (!hip) throw new Error('The seat must carry the hip contact.');
  const cushionTop = groupOn(r, parent, seat, {
    x: cm(hip.offsetMm.x),
    y: cm(hip.offsetMm.y) - SEAT_DRAWING_BELOW_HIP_CM,
    z: cm(hip.offsetMm.z),
  });
  for (const x of [-18, 18]) r.box(3, 2.2, 40, x, -6, 3, 'dark', cushionTop);
  r.box(48, 8, 42, 0, -4, 3, 'seat', cushionTop);
  r.box(34, 2.5, 34, 0, 0.8, 5, 'fabric', cushionTop);
  for (const x of [-22, 22]) {
    const bolster = r.box(6, 10, 36, x, 1, 2, 'seat', cushionTop);
    bolster.rotation = [0, 0, degToRad(x > 0 ? -8 : 8)];
    r.tube([x, 6, -12], [x, 6, 18], 0.22, 'orange', cushionTop);
  }
  const back = r.group(cushionTop, {
    position: [0, 0, -12],
    rotation: [-degToRad(reclineDeg), 0, 0],
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
    const screw = r.cylinder(2, 1, x, -4, -12, 'silver', cushionTop);
    screw.rotation = [0, 0, QUARTER_TURN];
  }
}

/** The pedal plate and three pedals, drawn from the plate's center. */
function drawPedals(r: RenderList, deck: ParentRef, plate: ResolvedPart) {
  if (plate.part.kind !== 'plate') throw new Error('The pedal plate must be a plate.');
  const { widthMm, thicknessMm, depthMm } = plate.part;
  r.box(cm(widthMm), cm(thicknessMm), cm(depthMm), 0, 0, 0, 'dark', deck, true);
  // The driver sits at -Z, so the contact face is the head's -Z face. The heads tilt back
  // to offset the deck's 0 to 35 degree tilt, so they face the driver and up.
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

/** The wheel uprights' brackets, and the wheel plate, base and rim from the wheel mount. */
function drawWheel(r: RenderList, parent: ParentRef, design: Design) {
  for (const side of ['right', 'left']) {
    const upright = partIn(design, `wheel-upright-${side}`);
    const { x, z } = centerCm(upright);
    r.box(7, 10, 0.8, x, cm(upright.box.min.y) + 7, z + 2.5, 'orange', parent);
  }
  const plate = partIn(design, 'wheel-plate');
  if (plate.part.kind !== 'plate') throw new Error('The wheel plate must be a plate.');
  const plateWidthCm = cm(plate.part.widthMm);
  const plateIn = WHEEL_PLATE_IN_MOUNT_CM;
  const mount = groupOn(r, parent, plate, {
    x: 0,
    y: heightCm(plate) / 2 - plateIn.y,
    z: -plateIn.z,
  });
  r.box(
    plateWidthCm,
    heightCm(plate),
    cm(plate.part.depthMm),
    0,
    plateIn.y,
    plateIn.z,
    'dark',
    mount,
  );
  for (const x of [-plateWidthCm / 2 + 3, plateWidthCm / 2 - 3])
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

/** A HOTAS plate with its pad and control, drawn from the plate's center. */
function drawSideMount(r: RenderList, plate: ParentRef, control: 'joystick' | 'throttle') {
  r.box(18, 1, 25, 0, 0, 0, 'orange', plate);
  r.box(16, 1, 23, 0, 0.8, 0, 'dark', plate);
  if (control === 'joystick') drawJoystick(r, plate, 0, 2, 0);
  else {
    r.box(12, 5, 18, 0, 4, 0, 'dark', plate);
    r.tube([0, 7, -3], [0, 12, 2], 1.5, 'dark', plate);
    r.box(12, 4, 6, 0, 12, 2, 'rubber', plate);
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

/** The shifter plate, and each device drawn from where it stands, level with the plate. */
function drawShifter(r: RenderList, parent: ParentRef, design: Design) {
  const plate = partIn(design, 'shifter-plate');
  r.box(20, 1, 30, 0, 0, 0, 'orange', plateCenter(r, parent, plate));
  const levelWithPlate = (device: ResolvedPart) =>
    groupOn(r, parent, device, { x: 0, y: -heightCm(plate) / 2, z: 0 });
  const shifter = design.get('shifter');
  if (shifter) {
    const at = levelWithPlate(shifter);
    r.box(10, 7, 12, 0, 4, 0, 'dark', at);
    r.cylinder(0.8, 11, 0, 13, 0, 'silver', at);
    r.sphere(2.8, 0, 19, 0, 'dark', at);
  }
  const handbrake = design.get('handbrake');
  if (handbrake) {
    const at = levelWithPlate(handbrake);
    r.box(5, 5, 12, 0, 3, 0, 'dark', at);
    r.tube([0, 5, 0], [0, 22, 4], 1.2, 'silver', at);
    r.tube([0, 16, 2], [0, 25, 5], 1.7, 'rubber', at);
  }
}

function drawCenterStick(r: RenderList, plate: ParentRef) {
  r.box(18, 0.8, 20, 0, 0, 0, 'orange', plate);
  drawJoystick(r, plate, 0, 1, 0);
}

/** A mannequin from the posture model, to check reach and clearances by eye. */
function drawPerson(r: RenderList, parent: ParentRef, s: CockpitConfig, b: Body) {
  const { hip, shoulder } = b;
  r.tube([0, hip.y + 5, hip.z], [0, shoulder.y - 3, shoulder.z], 10, 'blue', parent);
  r.sphere(8, 0, b.eye.y, b.eye.z, 'blue', parent);
  if (s.vrHeadset) r.box(17, 9, 9, 0, b.eye.y, b.eye.z + 6, 'dark', parent);
  for (const x of [-12, 12]) {
    r.sphere(4, x, hip.y, hip.z, 'blue', parent);
    r.tube([x, hip.y, hip.z], [x, b.legs.joint.y, b.legs.joint.z], 4.7, 'blue', parent);
    r.tube([x, b.legs.joint.y, b.legs.joint.z], [x, b.foot.y, b.foot.z], 3.5, 'blue', parent);
    r.box(8, 5, 18, x, b.foot.y - 2, b.foot.z + 3, 'blue', parent);
    if (b.hands) {
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
