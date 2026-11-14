// Adjustments: a part that slides within a travel without changing any other part, such as a
// seat on its rails or a plate in its slots. They are how the driver is fitted.
import type { Axis } from './assembly.ts';
import type { DataSource } from './catalog.ts';

export interface Adjustment {
  id: string;
  name: string;
  /** The part that slides. */
  partId: string;
  /** The cockpit axis it slides along. */
  axis: Axis;
  /** How far the rails or slots let it slide, end to end. */
  travelMm: number;
  source: DataSource;
}
