// The driver drawn in the cockpit editor while fitting: a figure of limbs from joint to joint
// on the seat's center plane, and a ball on the eye point. Points come in mm, drawn in cm. It is
// drawn over the parts, as a guide: the seat is drawn from its envelope, so the figure would
// otherwise be hidden in its cushion and backrest.
import type { Vec3Mm } from './cad/assembly.ts';
import type { DriverFigure } from './cad/driver.ts';
import type { ParentRef, RenderList, Vec3 } from './render-list.ts';
import { MM_PER_CM } from './shared/units.ts';

/** A limb as drawn: thin enough to see the seat and the wheel through the figure. */
const LIMB_RADIUS_CM = 2.5;
const EYE_BALL_RADIUS_CM = 3;
/** Violet, apart from the blue of the handles and the orange of the selection. */
const FIGURE = { kind: 'flat', color: 0x8a6fd6, opacity: 0.7, onTop: true } as const;
const EYE = { kind: 'flat', color: 0x8a6fd6, opacity: 1, onTop: true } as const;

const cm = ({ x, y, z }: Vec3Mm): Vec3 => [x / MM_PER_CM, y / MM_PER_CM, z / MM_PER_CM];

export function drawDriver(r: RenderList, parent: ParentRef, figure: DriverFigure): void {
  const limbs: [Vec3Mm, Vec3Mm][] = [
    [figure.hip, figure.knee],
    [figure.knee, figure.heel],
    [figure.hip, figure.shoulder],
    [figure.shoulder, figure.eye],
  ];
  if (figure.elbow && figure.hands)
    limbs.push([figure.shoulder, figure.elbow], [figure.elbow, figure.hands]);
  const limb = r.material(FIGURE);
  for (const [from, to] of limbs) r.tube(cm(from), cm(to), LIMB_RADIUS_CM, limb, parent);
  const [x, y, z] = cm(figure.eye);
  r.sphere(EYE_BALL_RADIUS_CM, x, y, z, r.material(EYE), parent);
}
