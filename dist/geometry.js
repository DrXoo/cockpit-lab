export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const round = (v, n = 1) => Math.round(v * 10 ** n) / 10 ** n;
const rad = (d) => (d * Math.PI) / 180;
export function transformPoint(p, placement) {
  const a = rad(placement.angle),
    c = Math.cos(a),
    s = Math.sin(a);
  return { x: placement.x + p.x * c + p.z * s, y: p.y ?? 0, z: placement.z - p.x * s + p.z * c };
}
export function inversePoint(p, placement) {
  return transformPoint(
    { x: p.x - placement.x, y: p.y, z: p.z - placement.z },
    { x: 0, z: 0, angle: -placement.angle },
  );
}
export function rectangle(x0, x1, z0, z1, placement) {
  return [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ].map(([x, z]) => transformPoint({ x, z }, placement));
}
export function overlapDepth(a, b) {
  let depth = Infinity;
  for (const poly of [a, b])
    for (let i = 0; i < poly.length; i++) {
      const p = poly[i],
        q = poly[(i + 1) % poly.length],
        len = Math.hypot(q.x - p.x, q.z - p.z),
        axis = { x: -(q.z - p.z) / len, z: (q.x - p.x) / len };
      const pa = a.map((v) => v.x * axis.x + v.z * axis.z),
        pb = b.map((v) => v.x * axis.x + v.z * axis.z),
        overlap =
          Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb));
      if (overlap <= 0) return 0;
      depth = Math.min(depth, overlap);
    }
  return depth;
}
export function polygonDistance(a, b) {
  const overlap = overlapDepth(a, b);
  if (overlap > 0) return -overlap;
  let distance = Infinity;
  for (const [points, edges] of [
    [a, b],
    [b, a],
  ])
    for (const p of points)
      for (let i = 0; i < edges.length; i++) {
        const v = edges[i],
          w = edges[(i + 1) % edges.length],
          dx = w.x - v.x,
          dz = w.z - v.z,
          t = clamp(((p.x - v.x) * dx + (p.z - v.z) * dz) / (dx * dx + dz * dz), 0, 1);
        distance = Math.min(distance, Math.hypot(p.x - v.x - t * dx, p.z - v.z - t * dz));
      }
  return distance;
}
