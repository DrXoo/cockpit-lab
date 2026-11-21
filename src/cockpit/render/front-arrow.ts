// Draws which way is the front of the cockpit: an arrow on the floor ahead of the design, along
// +Z, as the coordinate convention has it (AGENTS.md: Domain rules). Every design is built to
// it, so the driver, the posture and the peripherals facing the front all look the same way.
import type { SceneBounds } from '../../scene/camera.ts';
import { floorHeightCm } from '../../scene/camera.ts';
import type { ParentRef, RenderList } from '../../scene/render-list.ts';

/** How far ahead of the front of the design the arrow starts. */
const GAP_AHEAD_CM = 8;
const SHAFT_LENGTH_CM = 12;
const SHAFT_HALF_WIDTH_CM = 2;
const HEAD_LENGTH_CM = 9;
const HEAD_HALF_WIDTH_CM = 6;
/** Above the floor, so the floor does not cover it. */
const LIFT_CM = 0.2;
/** How far beyond the tip its label stands. */
const LABEL_AHEAD_CM = 5;
/** Room for the label beyond its anchor, as it shows at the scale of a whole design. */
const LABEL_HALF_DEPTH_CM = 5;
/** The green grey of the measurements, darker so it shows on the floor of either theme. */
const ARROW_COLOR = '#7f8c71';
const ARROW_OPACITY = 0.8;

export function drawFrontArrow(r: RenderList, parent: ParentRef, bounds: SceneBounds): void {
  const centerX = (bounds.left + bounds.right) / 2;
  const startZ = bounds.front + GAP_AHEAD_CM;
  const headZ = startZ + SHAFT_LENGTH_CM;
  const outline = [
    { x: centerX - SHAFT_HALF_WIDTH_CM, z: startZ },
    { x: centerX + SHAFT_HALF_WIDTH_CM, z: startZ },
    { x: centerX + SHAFT_HALF_WIDTH_CM, z: headZ },
    { x: centerX + HEAD_HALF_WIDTH_CM, z: headZ },
    { x: centerX, z: tipZ(bounds) },
    { x: centerX - HEAD_HALF_WIDTH_CM, z: headZ },
    { x: centerX - SHAFT_HALF_WIDTH_CM, z: headZ },
  ];
  const heightCm = floorHeightCm(bounds) + LIFT_CM;
  r.fill(outline, ARROW_COLOR, ARROW_OPACITY, heightCm, parent);
  const label = r.label('Front', centerX, heightCm, labelZ(bounds), true);
  label.alwaysShown = true;
}

/**
 * The bounds of a design with its front arrow and label, for a view to frame them all. They grow
 * as much behind as ahead, so the design stays in the middle of the view.
 */
export function boundsWithFrontArrow(bounds: SceneBounds): SceneBounds {
  const aheadCm = labelZ(bounds) + LABEL_HALF_DEPTH_CM - bounds.front;
  return { ...bounds, back: bounds.back - aheadCm, front: bounds.front + aheadCm };
}

const tipZ = (bounds: SceneBounds) =>
  bounds.front + GAP_AHEAD_CM + SHAFT_LENGTH_CM + HEAD_LENGTH_CM;
const labelZ = (bounds: SceneBounds) => tipZ(bounds) + LABEL_AHEAD_CM;
