// What the measure tool tells the user in the view: the next click to make, or what the two
// clicked points measure. The axes are named the way the driver sees them: +X to the left,
// +Y up and +Z to the front.
import type { Axis } from '../cad/parts/assembly.ts';
import type { Measurement } from '../cad/analysis/measure.ts';
import { round } from '../../shared/geometry.ts';

/** Measurements are shown to the tenth of a mm, as the design history shows lengths. */
const MEASURE_DECIMALS = 1;
const AXES: readonly Axis[] = ['x', 'y', 'z'];
const WAYS: Record<Axis, { positive: string; negative: string }> = {
  x: { positive: 'to the left', negative: 'to the right' },
  y: { positive: 'up', negative: 'down' },
  z: { positive: 'to the front', negative: 'to the back' },
};

const mm = (valueMm: number) => `${round(valueMm, MEASURE_DECIMALS)} mm`;

/** The readout for a measurement with `picks` points clicked so far. */
export function measureReadout(picks: number, measurement: Measurement | null): string {
  if (measurement === null)
    return picks === 0
      ? 'Click a point on a part to measure from.'
      : 'Click a second point, or the face across from the first to measure the gap.';
  if (measurement.kind === 'gap') return `Gap between the faces: ${mm(measurement.gapMm)}`;
  const legs = AXES.map((axis) => {
    const offsetMm = measurement.offsetMm[axis];
    const rounded = round(offsetMm, MEASURE_DECIMALS);
    const way = rounded > 0 ? WAYS[axis].positive : rounded < 0 ? WAYS[axis].negative : '';
    const name = `${axis.toUpperCase()} ${mm(Math.abs(offsetMm))}`;
    return way === '' ? name : `${name} ${way}`;
  });
  return `From the first point: ${legs.join(' · ')}`;
}
