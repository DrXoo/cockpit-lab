// Draws a measurement of the cockpit design: a marker at each clicked point, and the gap across
// two facing faces or one leg per axis from the first point to the second. Points are in cockpit
// mm; the scene works in cm. A measurement is drawn whether dimensions are shown or not, since
// the user asked for it.
import type { Axis, Vec3Mm } from '../cad/parts/assembly.ts';
import type { Measurement } from '../cad/analysis/measure.ts';
import { round } from '../../shared/geometry.ts';
import type { ParentRef, RenderList, SceneLabel, Vec3 } from '../../scene/render-list.ts';
import { MM_PER_CM } from '../../shared/units.ts';

/** A measurement as the view shows it: its clicked points, and what they measure once two. */
export interface MeasureDrawing {
  points: readonly Vec3Mm[];
  measurement: Measurement | null;
}

const MARKER_RADIUS_CM = 0.8;
/** Measurements are shown to the tenth of a mm, as the design history shows lengths. */
const MEASURE_DECIMALS = 1;
/** How far a label stands off its line, so it does not cover the parts it measures. */
const LABEL_STANDOFF_CM = 3;
const AXES: readonly Axis[] = ['x', 'y', 'z'];

const cm = ({ x, y, z }: Vec3Mm): Vec3 => [x / MM_PER_CM, y / MM_PER_CM, z / MM_PER_CM];
const mm = (valueMm: number) => `${round(Math.abs(valueMm), MEASURE_DECIMALS)} mm`;

export function drawMeasurement(r: RenderList, parent: ParentRef, drawing: MeasureDrawing): void {
  for (const point of drawing.points) r.sphere(MARKER_RADIUS_CM, ...cm(point), 'selected', parent);
  const { measurement } = drawing;
  if (measurement === null) return;
  if (measurement.kind === 'gap') {
    const label = r.dimension(
      cm(measurement.fromMm),
      cm(measurement.toMm),
      mm(measurement.gapMm),
      [0, LABEL_STANDOFF_CM, 0],
      parent,
    );
    shownAlways(label, 'gap');
    return;
  }
  let corner = measurement.fromMm;
  for (const axis of AXES) {
    const offsetMm = measurement.offsetMm[axis];
    if (round(offsetMm, MEASURE_DECIMALS) === 0) continue;
    const next = { ...corner, [axis]: corner[axis] + offsetMm };
    const text = `${axis.toUpperCase()} ${mm(offsetMm)}`;
    const label = r.dimension(cm(corner), cm(next), text, [0, LABEL_STANDOFF_CM, 0], parent);
    shownAlways(label, `offset-${axis}`);
    corner = next;
  }
}

function shownAlways(label: SceneLabel, measures: string) {
  label.measures = measures;
  label.alwaysShown = true;
}
