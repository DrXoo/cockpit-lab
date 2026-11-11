// Turns render primitives into Three.js objects, in the order they were drawn.
import * as T from 'three';
import type { MaterialRef, MaterialSpec, PaletteMaterial, Primitive, Vec3 } from './render-list.ts';
import { ROOT } from './render-list.ts';

/** The shared materials, plus the outline used on box edges. */
export type Palette = Record<PaletteMaterial | 'edge', T.Material>;

/** Boxes, planes and lines thinner than this would be degenerate. */
const MIN_BOX_SIDE_CM = 0.1;
const MIN_TUBE_LENGTH_CM = 0.01;
const TUBE_SEGMENTS = 12;
const SPHERE_SEGMENTS: [width: number, height: number] = [16, 10];
const DASHED_LINE = { color: 0x9ba78d, dashSize: 3, gapSize: 2, transparent: true, opacity: 0.7 };
const UP = new T.Vector3(0, 1, 0);

const vector = ([x, y, z]: Vec3) => new T.Vector3(x, y, z);

function createMaterial(spec: MaterialSpec): T.Material {
  if (spec.kind === 'flat')
    return new T.MeshBasicMaterial({
      color: spec.color,
      transparent: spec.opacity < 1,
      opacity: spec.opacity,
      side: T.DoubleSide,
      depthWrite: spec.opacity === 1,
    });
  if (spec.kind === 'matte')
    return new T.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness });
  return spec.opacity === undefined
    ? new T.LineBasicMaterial({ color: spec.color })
    : new T.LineBasicMaterial({ color: spec.color, transparent: true, opacity: spec.opacity });
}

function place(object: T.Object3D, position: Vec3, rotation: Vec3) {
  object.position.set(...position);
  object.rotation.set(...rotation);
}

/** Adds the primitives under `root`; ROOT in the list stands for it. */
export function addPrimitives(
  primitives: readonly Primitive[],
  root: T.Object3D,
  palette: Palette,
): void {
  const parents = new Map<number, T.Object3D>([[ROOT, root]]);
  const materials = new Map<number, T.Material>();
  const parentOf = (id: number): T.Object3D => {
    const parent = parents.get(id);
    if (!parent) throw new Error(`Render list: unknown parent ${id}`);
    return parent;
  };
  const materialOf = (ref: MaterialRef): T.Material => {
    if (typeof ref !== 'number') return palette[ref];
    const material = materials.get(ref);
    if (!material) throw new Error(`Render list: unknown material ${ref}`);
    return material;
  };

  for (const p of primitives) {
    switch (p.kind) {
      case 'material':
        materials.set(p.id, createMaterial(p.spec));
        break;
      case 'group': {
        const group = new T.Group();
        place(group, p.position, p.rotation);
        group.visible = p.visible;
        parentOf(p.parent).add(group);
        parents.set(p.id, group);
        break;
      }
      case 'box': {
        const [w, h, d] = p.size.map((side) => Math.max(side, MIN_BOX_SIDE_CM));
        const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), materialOf(p.material));
        place(mesh, p.position, p.rotation);
        mesh.scale.set(...p.scale);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        parentOf(p.parent).add(mesh);
        if (p.edges) mesh.add(new T.LineSegments(new T.EdgesGeometry(mesh.geometry), palette.edge));
        parents.set(p.id, mesh);
        break;
      }
      case 'cylinder': {
        const geometry = new T.CylinderGeometry(p.radius, p.radius, p.length, p.segments);
        const mesh = new T.Mesh(geometry, materialOf(p.material));
        place(mesh, p.position, p.rotation);
        mesh.castShadow = true;
        parentOf(p.parent).add(mesh);
        break;
      }
      case 'sphere': {
        const mesh = new T.Mesh(
          new T.SphereGeometry(p.radius, ...SPHERE_SEGMENTS),
          materialOf(p.material),
        );
        place(mesh, p.position, p.rotation);
        mesh.scale.set(...p.scale);
        mesh.castShadow = true;
        parentOf(p.parent).add(mesh);
        break;
      }
      case 'tube': {
        const from = vector(p.from);
        const to = vector(p.to);
        const length = Math.max(MIN_TUBE_LENGTH_CM, from.distanceTo(to));
        const mesh = new T.Mesh(
          new T.CylinderGeometry(p.radius, p.radius, length, TUBE_SEGMENTS),
          materialOf(p.material),
        );
        mesh.position.copy(from).add(to).multiplyScalar(0.5);
        mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize());
        mesh.castShadow = true;
        parentOf(p.parent).add(mesh);
        break;
      }
      case 'torus': {
        const geometry = new T.TorusGeometry(p.radius, p.tube, p.radialSegments, p.tubularSegments);
        const mesh = new T.Mesh(geometry, materialOf(p.material));
        place(mesh, p.position, p.rotation);
        mesh.castShadow = true;
        parentOf(p.parent).add(mesh);
        break;
      }
      case 'line': {
        const geometry = new T.BufferGeometry().setFromPoints(p.points.map(vector));
        if (p.material === 'dashed') {
          const line = new T.Line(geometry, new T.LineDashedMaterial(DASHED_LINE));
          line.computeLineDistances();
          parentOf(p.parent).add(line);
        } else parentOf(p.parent).add(new T.Line(geometry, materialOf(p.material)));
        break;
      }
      case 'fill': {
        const shape = new T.Shape(p.outline.map((point) => new T.Vector2(point.x, point.z)));
        const mesh = new T.Mesh(new T.ShapeGeometry(shape), materialOf(p.material));
        mesh.rotation.x = Math.PI / 2;
        mesh.position.y = p.height;
        parentOf(p.parent).add(mesh);
        break;
      }
      case 'plane': {
        const mesh = new T.Mesh(new T.PlaneGeometry(p.width, p.depth), materialOf(p.material));
        place(mesh, p.position, p.rotation);
        mesh.receiveShadow = true;
        parentOf(p.parent).add(mesh);
        break;
      }
    }
  }
}
