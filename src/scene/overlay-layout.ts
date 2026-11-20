// Where the elements over the 3D view go on screen: the arrows of the move handles, the joint
// markers, and the boxes kept beside a point or above an outline. Points are in CSS pixels from
// the top left corner of the view.

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenSize {
  width: number;
  height: number;
}

/** Arrows start this far out of the part's center, so a click on the center still picks it. */
export const ARROW_START_PX = 10;
/** The length of a move arrow, unless a ball lies ahead of it. */
const ARROW_LENGTH_PX = 48;
/** Short of this, an arrow would be little more than its head. */
const ARROW_MIN_LENGTH_PX = 24;
/** How far short of a ball ahead of it an arrow stops: the ball's radius and a gap. */
const BALL_CLEARANCE_PX = 12;
/** A ball this close to the line of an arrow lies ahead of it. */
const AHEAD_WITHIN_PX = 12;

/** A joint marker this near the center of the selected part would cover where its arrows start. */
const MARKER_CLEARANCE_PX = 22;

/** How far an element kept beside a point stands from it, and from the edges of the view. */
const ANCHORED_GAP_PX = 16;
const ANCHORED_MARGIN_PX = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

/**
 * How long an arrow out of `from` in `direction` on screen is drawn: short of the nearest ball
 * ahead of it, so the two never cover each other, but never shorter than an arrow can be.
 */
export function arrowLengthPx(
  from: ScreenPoint,
  direction: ScreenPoint,
  balls: readonly ScreenPoint[],
): number {
  let lengthPx = ARROW_LENGTH_PX;
  for (const ball of balls) {
    const offset = { x: ball.x - from.x, y: ball.y - from.y };
    const aheadPx = offset.x * direction.x + offset.y * direction.y;
    const asidePx = Math.abs(offset.x * direction.y - offset.y * direction.x);
    if (aheadPx <= 0 || asidePx > AHEAD_WITHIN_PX) continue;
    lengthPx = Math.min(lengthPx, aheadPx - BALL_CLEARANCE_PX - ARROW_START_PX);
  }
  return Math.max(lengthPx, ARROW_MIN_LENGTH_PX);
}

/**
 * Where a joint marker at `at` is drawn: where it is, unless it lies on the center of the
 * selected part, where it moves out to the side its arrows leave most room on.
 */
export function clearOfCenter(
  at: ScreenPoint,
  center: ScreenPoint,
  arrowDirections: readonly ScreenPoint[],
): ScreenPoint {
  if (Math.hypot(at.x - center.x, at.y - center.y) >= MARKER_CLEARANCE_PX) return at;
  const sides = Array.from({ length: 8 }, (_, index) => {
    const angleRad = (index * Math.PI) / 4 + Math.PI / 8;
    return { x: Math.cos(angleRad), y: Math.sin(angleRad) };
  });
  // The side least in line with any arrow: the one whose nearest arrow is furthest round.
  const nearestArrow = (side: ScreenPoint) =>
    Math.max(-1, ...arrowDirections.map((arrow) => arrow.x * side.x + arrow.y * side.y));
  const [freest = { x: 0, y: 1 }] = [...sides].sort((a, b) => nearestArrow(a) - nearestArrow(b));
  return {
    x: center.x + freest.x * MARKER_CLEARANCE_PX,
    y: center.y + freest.y * MARKER_CLEARANCE_PX,
  };
}

/**
 * The top left corner of an element of size `box` kept beside the point `at`: to the right of
 * it unless it would leave the view, or unless a point to keep clear of (`clearOfX`, such as the
 * tip of the arrow being dragged) lies there and the element fits on the left; and always whole
 * within the view, so it never has to be scrolled to.
 */
export function besidePoint(
  at: ScreenPoint,
  box: ScreenSize,
  view: ScreenSize,
  clearOfX: number | null,
): ScreenPoint {
  const right = at.x + ANCHORED_GAP_PX;
  const leftOf = at.x - ANCHORED_GAP_PX - box.width;
  const rightIsTaken =
    (clearOfX ?? at.x) > at.x + ANCHORED_GAP_PX / 2 && leftOf >= ANCHORED_MARGIN_PX;
  const rightFits = right + box.width <= view.width - ANCHORED_MARGIN_PX;
  const left = rightFits && !rightIsTaken ? right : leftOf;
  return withinView({ x: left, y: at.y - box.height / 2 }, box, view);
}

/**
 * The top left corner of an element of size `box` centered above the outline some points make,
 * or below it when there is no room above, whole within the view.
 */
export function aboveOutline(
  outline: readonly ScreenPoint[],
  box: ScreenSize,
  view: ScreenSize,
): ScreenPoint {
  const left = Math.min(...outline.map((p) => p.x));
  const right = Math.max(...outline.map((p) => p.x));
  const top = Math.min(...outline.map((p) => p.y));
  const bottom = Math.max(...outline.map((p) => p.y));
  const above = top - ANCHORED_GAP_PX - box.height;
  const y = above >= ANCHORED_MARGIN_PX ? above : bottom + ANCHORED_GAP_PX;
  const x = (left + right) / 2 - box.width / 2;
  return withinView({ x, y }, box, view);
}

function withinView(corner: ScreenPoint, box: ScreenSize, view: ScreenSize): ScreenPoint {
  return {
    x: clamp(corner.x, ANCHORED_MARGIN_PX, view.width - box.width - ANCHORED_MARGIN_PX),
    y: clamp(corner.y, ANCHORED_MARGIN_PX, view.height - box.height - ANCHORED_MARGIN_PX),
  };
}
