// Plan geometry on the floor plane (X, Z). Units are whatever the caller uses (cm today).

/** A point in the floor plane; `y` (height) is optional and carried through transforms. */
export interface PlanPoint {
  x: number;
  y?: number;
  z: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** Position in the floor plane plus a rotation about +Y, in degrees. */
export interface Placement {
  x: number;
  z: number;
  angle: number;
}

export type Polygon = readonly PlanPoint[];

/** A prism: a footprint extruded from y0 to y1. */
export interface Solid {
  polygon: Polygon;
  y0: number;
  y1: number;
}

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

export const round = (value: number, decimals = 1): number =>
  Math.round(value * 10 ** decimals) / 10 ** decimals;

export const degToRad = (degrees: number): number => (degrees * Math.PI) / 180;

/** Rotates a local point by the placement angle, then translates it. */
export function transformPoint(point: PlanPoint, placement: Placement): Point3 {
  const angle = degToRad(placement.angle);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: placement.x + point.x * cos + point.z * sin,
    y: point.y ?? 0,
    z: placement.z - point.x * sin + point.z * cos,
  };
}

/** Converts a world point back into the local frame of a placement. */
export function inversePoint(point: PlanPoint, placement: Placement): Point3 {
  return transformPoint(
    { x: point.x - placement.x, y: point.y, z: point.z - placement.z },
    { x: 0, z: 0, angle: -placement.angle },
  );
}

/** The four corners of a local axis-aligned rectangle, placed in the world. */
export function rectangle(
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  placement: Placement,
): Point3[] {
  const corners: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  return corners.map(([x, z]) => transformPoint({ x, z }, placement));
}

const project = (polygon: Polygon, axis: { x: number; z: number }): number[] =>
  polygon.map((vertex) => vertex.x * axis.x + vertex.z * axis.z);

/**
 * Minimum penetration depth between two convex polygons (separating axis test).
 * Returns 0 when they are apart or only touch.
 */
export function overlapDepth(a: Polygon, b: Polygon): number {
  let depth = Infinity;
  for (const polygon of [a, b])
    for (let i = 0; i < polygon.length; i++) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      const length = Math.hypot(end.x - start.x, end.z - start.z);
      const normal = { x: -(end.z - start.z) / length, z: (end.x - start.x) / length };
      const projectedA = project(a, normal);
      const projectedB = project(b, normal);
      const overlap =
        Math.min(Math.max(...projectedA), Math.max(...projectedB)) -
        Math.max(Math.min(...projectedA), Math.min(...projectedB));
      if (overlap <= 0) return 0;
      depth = Math.min(depth, overlap);
    }
  return depth;
}

/** Gap between two convex polygons; negative (minus the penetration depth) when they overlap. */
export function polygonDistance(a: Polygon, b: Polygon): number {
  const overlap = overlapDepth(a, b);
  if (overlap > 0) return -overlap;
  let distance = Infinity;
  const pairs: [Polygon, Polygon][] = [
    [a, b],
    [b, a],
  ];
  for (const [points, edges] of pairs)
    for (const point of points)
      for (let i = 0; i < edges.length; i++) {
        const start = edges[i];
        const end = edges[(i + 1) % edges.length];
        const dx = end.x - start.x;
        const dz = end.z - start.z;
        const t = clamp(
          ((point.x - start.x) * dx + (point.z - start.z) * dz) / (dx * dx + dz * dz),
          0,
          1,
        );
        distance = Math.min(
          distance,
          Math.hypot(point.x - start.x - t * dx, point.z - start.z - t * dz),
        );
      }
  return distance;
}
