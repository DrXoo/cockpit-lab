// The pointer on the 3D view: a click picks a part of the cockpit design, the pointer at rest
// marks the part under it, and a press drags a handle of the selected part, a monitor arm joint
// or an item of the layout in the plan. What it moves is told through the scene's callbacks.
import * as T from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import {
  distanceAlongAxis,
  type Handle,
  type HandleModifiers,
} from '../cockpit/cad/interaction/handles.ts';
import { hitAlongRay, type PartHit } from '../cockpit/cad/interaction/picking.ts';
import type { CockpitDrawing } from '../cockpit/render/cad.ts';
import type { RoomConfig } from '../room/config.ts';
import {
  draggedPosition,
  pickLayoutItem,
  type LayoutGrab,
} from '../room/editing/layout-picking.ts';
import type { CockpitEvaluation } from '../room/evaluate.ts';
import type { ArmHandle } from '../room/render/desk.ts';
import { inversePoint } from '../shared/geometry.ts';
import { MM_PER_CM } from '../shared/units.ts';
import type { SceneView } from './camera.ts';
import type { Mark } from './hover-mark.ts';

export type ArmJoint = ArmHandle['id'];

/** A point on the page, in CSS pixels from its top left corner. */
export interface PagePoint {
  x: number;
  y: number;
}

/** What the pointer tells the app it did in the view. */
export interface PointerCallbacks {
  onArmMove: ((joint: ArmJoint, x: number, z: number) => void) | undefined;
  onLayoutMove: ((target: string, x: number, z: number) => void) | undefined;
  onLayoutSelect: ((target: string) => void) | undefined;
  /** A click picked a part of the cockpit design, at a face, or nothing (null). */
  onPartPick: ((hit: PartHit | null) => void) | undefined;
  /**
   * The pointer moved over the cockpit design: the part it marks, or null, and where the pointer
   * is on the page.
   */
  onPartHover: ((hit: PartHit | null, pointer: PagePoint) => void) | undefined;
  /** A handle of the selected part was grabbed. */
  onHandleGrab: ((handle: Handle) => void) | undefined;
  /** A grabbed handle moved this far along its axis, out of the end, since it was grabbed. */
  onHandleDrag: ((handle: Handle, movedMm: number, modifiers: HandleModifiers) => void) | undefined;
  /** A grabbed handle was let go. */
  onHandleRelease: ((handle: Handle) => void) | undefined;
}

/** The scene the pointer acts on: what it draws, its options and whom it tells. */
export interface PointerHost extends PointerCallbacks {
  readonly s: RoomConfig | null;
  readonly e: CockpitEvaluation | null;
  readonly cockpit: CockpitDrawing | null;
  readonly armHandles: readonly ArmHandle[];
  readonly view: SceneView;
  readonly layoutEditing: boolean;
  /** The item the layout edits, which a press on another item makes it. */
  layoutTarget: string;
  readonly roomEditing: boolean;
  /** Whether a part is marked under the pointer. */
  readonly hoverMarked: boolean;
  markHover(mark: Mark | null): void;
}

/** What the pointer works through: the view's element, its camera and its orbit controls. */
export interface PointerView {
  element: (T.WebGLRenderer | SVGRenderer)['domElement'];
  /** The element the view fills, whose size the view takes. */
  container: HTMLElement;
  camera: T.Camera;
  controls: OrbitControls;
}

/** A monitor arm joint, a layout item or a handle of a part, being dragged. */
type Drag =
  | { kind: 'arm'; joint: ArmJoint }
  | { kind: 'layout'; grab: LayoutGrab }
  | { kind: 'handle'; handle: Handle; grabbedAtMm: number };

const PRIMARY_BUTTON = 0;
/** A press that moves less than this before it is released is a click, not an orbit or a pan. */
const CLICK_TOLERANCE_PX = 4;
/** An arm joint can be grabbed this many px from its marker or from its label. */
const ARM_HANDLE_GRAB_RADIUS_PX = 20;
const ARM_HANDLE_LABEL_OFFSET_PX = -20;
/** The arm markers float this far above the joints. */
const ARM_HANDLE_LIFT_CM = 3;
/** How near on screen a dragged handle comes to a place before it snaps there. */
const SNAP_WITHIN_PX = 10;
/** A handle seen almost end on would snap from afar: it never snaps from further than this. */
const MAX_SNAP_WITHIN_MM = 50;
/** How far along a handle the screen scale of its axis is measured. */
const SNAP_SCALE_SPAN_MM = 100;

export const isPlanView = (view: SceneView) => view === 'top' || view === 'desk';

/** A ray in world cm, in the mm the CAD measures in. */
const rayInMm = ({ origin, direction }: T.Ray) => ({
  originMm: { x: origin.x * MM_PER_CM, y: origin.y * MM_PER_CM, z: origin.z * MM_PER_CM },
  directionMm: { x: direction.x, y: direction.y, z: direction.z },
});

export class ScenePointer {
  declare private readonly host: PointerHost;
  declare private readonly view: PointerView;
  /** Clicking picks a part of the cockpit design. */
  declare private partPicking: boolean;
  /** Where a press that may become a click started. */
  declare private press: { pointerId: number; x: number; y: number } | null;
  declare private drag: Drag | null;
  /** The part and face marked under the pointer, to redraw only when they change. */
  declare private hoverKey: string;

  constructor(host: PointerHost, view: PointerView) {
    this.host = host;
    this.view = view;
    this.partPicking = false;
    this.press = null;
    this.drag = null;
    this.hoverKey = '';
  }

  /** Capture-phase listeners, so a drag stops the orbit controls from panning. */
  install() {
    const element: GlobalEventHandlers = this.view.element;
    element.addEventListener('pointerdown', (event) => this.onPointerDown(event), true);
    element.addEventListener('pointermove', (event) => this.onPointerMove(event), true);
    element.addEventListener('pointerup', (event) => this.onPointerUp(event), true);
    element.addEventListener('pointerup', (event) => this.onPointerEnd(event), true);
    element.addEventListener('pointercancel', (event) => this.onPointerEnd(event), true);
    element.addEventListener('pointerleave', () => this.clearHover());
  }

  /** Lets a click pick a part of the cockpit design drawn on its own. */
  setPartPicking(on: boolean) {
    this.partPicking = on;
    this.press = null;
  }

  /** A press on a handle of the selected part, which drags it. */
  grabHandle(event: PointerEvent, handle: Handle) {
    if (event.button !== PRIMARY_BUTTON) return;
    const grabbedAtMm = this.alongHandle(event, handle);
    if (grabbedAtMm === null) return;
    // A press on a handle drags it: it neither orbits nor picks the part under it.
    this.press = null;
    this.clearHover();
    this.startDrag(event, { kind: 'handle', handle, grabbedAtMm });
    this.host.onHandleGrab?.(handle);
  }

  /** Takes the mark off the part under the pointer, if any. */
  clearHover() {
    if (this.hoverKey === '' && !this.host.hoverMarked) return;
    this.hoverKey = '';
    this.host.markHover(null);
    this.host.onPartHover?.(null, { x: 0, y: 0 });
  }

  /** Where the pointer is along the axis of a handle, from the end it changes. */
  private alongHandle(event: PointerEvent, handle: Handle): number | null {
    return distanceAlongAxis(rayInMm(this.rayAt(event)), handle.pointMm, handle.outwardMm);
  }

  /** How many mm along a handle's axis `SNAP_WITHIN_PX` on screen cover where the handle is. */
  private snapWithinMm({ pointMm, outwardMm }: Handle): number {
    const w = this.view.container.clientWidth;
    const h = this.view.container.clientHeight;
    const onScreen = (alongMm: number) => {
      const p = new T.Vector3(
        (pointMm.x + outwardMm.x * alongMm) / MM_PER_CM,
        (pointMm.y + outwardMm.y * alongMm) / MM_PER_CM,
        (pointMm.z + outwardMm.z * alongMm) / MM_PER_CM,
      ).project(this.view.camera);
      return { x: p.x * 0.5 * w, y: p.y * 0.5 * h };
    };
    const from = onScreen(0);
    const to = onScreen(SNAP_SCALE_SPAN_MM);
    const pxPerMm = Math.hypot(to.x - from.x, to.y - from.y) / SNAP_SCALE_SPAN_MM;
    return pxPerMm > 0 ? Math.min(SNAP_WITHIN_PX / pxPerMm, MAX_SNAP_WITHIN_MM) : 0;
  }

  /** The ray from the camera through the point under the pointer, in world cm. */
  private rayAt(event: PointerEvent): T.Ray {
    const r = this.view.element.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.view.camera,
    );
    return ray.ray;
  }

  /** The point under the pointer on the horizontal plane at `height`. */
  private pointerOnPlane(event: PointerEvent, height = 0): T.Vector3 | null {
    return this.rayAt(event).intersectPlane(
      new T.Plane(new T.Vector3(0, 1, 0), -height),
      new T.Vector3(),
    );
  }

  /** The part of the cockpit design under the pointer, with the face there, or null. */
  private partAt(event: PointerEvent): PartHit | null {
    const { cockpit } = this.host;
    if (!cockpit) return null;
    const { resolved, previewPartId, ghostPartId, fitting = false } = cockpit;
    // A part about to be added is only a preview, a part the mode takes off only a ghost, and
    // out of Fit a peripheral is only a reference: clicks go through them.
    const pickable = new Map(
      [...resolved].filter(
        ([partId, { part }]) =>
          partId !== previewPartId &&
          partId !== ghostPartId &&
          (fitting || part.kind !== 'peripheral'),
      ),
    );
    return hitAlongRay(pickable, rayInMm(this.rayAt(event)));
  }

  /** The arm joint whose marker or label is under the pointer. */
  private armHandleAt(event: PointerEvent): ArmHandle | undefined {
    const r = this.view.element.getBoundingClientRect();
    return this.host.armHandles
      .map((handle) => {
        const { x, y, z } = handle.point;
        const q = new T.Vector3(x, y + ARM_HANDLE_LIFT_CM, z).project(this.view.camera);
        const distance = Math.min(
          ...[0, ARM_HANDLE_LABEL_OFFSET_PX].map((offset) =>
            Math.hypot(
              event.clientX - (r.left + (q.x * 0.5 + 0.5) * r.width),
              event.clientY - (r.top + (-q.y * 0.5 + 0.5) * r.height + offset),
            ),
          ),
        );
        return { handle, distance };
      })
      .sort((a, b) => a.distance - b.distance)
      .find((hit) => hit.distance <= ARM_HANDLE_GRAB_RADIUS_PX)?.handle;
  }

  private startDrag(event: PointerEvent, drag: Drag) {
    event.preventDefault();
    event.stopImmediatePropagation();
    this.view.controls.enabled = false;
    this.drag = drag;
    this.view.element.setPointerCapture(event.pointerId);
    this.view.element.style.cursor = 'grabbing';
  }

  /**
   * Marks the part under the pointer, or, while a part is about to be added to another, the face
   * of that part a click would choose. Nothing is marked while a button is held.
   */
  private hoverAt(event: PointerEvent) {
    const { cockpit } = this.host;
    if (!this.partPicking || !cockpit || event.buttons !== 0) {
      this.clearHover();
      return;
    }
    const hit = this.partAt(event);
    const choosing = cockpit.choosingFaceOf ?? null;
    const marked = hit && (choosing === null || hit.partId === choosing) ? hit : null;
    const face = marked && choosing !== null ? marked.face : null;
    const key = marked ? `${marked.partId}|${face ?? ''}` : '';
    if (key !== this.hoverKey) {
      this.hoverKey = key;
      const resolved = marked ? cockpit.resolved.get(marked.partId) : undefined;
      this.host.markHover(resolved ? { resolved, face } : null);
    }
    this.host.onPartHover?.(marked, { x: event.clientX, y: event.clientY });
  }

  private onPointerDown(event: PointerEvent) {
    this.clearHover();
    if (this.partPicking && event.button === PRIMARY_BUTTON)
      this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const { s, e, layoutEditing, view, roomEditing } = this.host;
    if (!s || !e) return;
    if (!layoutEditing || !isPlanView(view) || event.button !== PRIMARY_BUTTON) return;
    const floor = this.pointerOnPlane(event);
    const top = this.pointerOnPlane(event, s.deskH);
    if (!floor || !top) return;
    if (this.host.layoutTarget === 'arm' && s.deskEnabled !== false && s.monitorEnabled !== false) {
      const handle = this.armHandleAt(event);
      if (handle) {
        this.startDrag(event, { kind: 'arm', joint: handle.id });
        return;
      }
    }
    const grab = pickLayoutItem(floor, top, s, e, {
      layoutTarget: this.host.layoutTarget,
      roomEditing,
    });
    if (!grab) return;
    this.host.layoutTarget = grab.target;
    this.host.onLayoutSelect?.(grab.target);
    this.startDrag(event, { kind: 'layout', grab });
  }

  private onPointerMove(event: PointerEvent) {
    const { drag } = this;
    const { s, e } = this.host;
    if (!drag) {
      this.hoverAt(event);
      return;
    }
    if (drag.kind === 'handle') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const alongMm = this.alongHandle(event, drag.handle);
      if (alongMm !== null)
        this.host.onHandleDrag?.(drag.handle, alongMm - drag.grabbedAtMm, {
          shiftHeld: event.shiftKey,
          free: event.altKey,
          snapWithinMm: this.snapWithinMm(drag.handle),
        });
      return;
    }
    if (!s || !e) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (drag.kind === 'arm') {
      const p = this.pointerOnPlane(event, s.monitorH + ARM_HANDLE_LIFT_CM);
      if (p) this.host.onArmMove?.(drag.joint, p.x, p.z);
      return;
    }
    const { grab } = drag;
    const p = this.pointerOnPlane(event, grab.desktop ? s.deskH : 0);
    if (!p) return;
    const { x, z } = draggedPosition(grab, grab.desktop ? inversePoint(p, e.deskPose) : p);
    this.host.onLayoutMove?.(grab.target, x, z);
  }

  /** A press released where it started picks the part under it. */
  private onPointerUp(event: PointerEvent) {
    const { press } = this;
    this.press = null;
    if (!this.partPicking || !press || press.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved <= CLICK_TOLERANCE_PX) this.host.onPartPick?.(this.partAt(event));
  }

  private onPointerEnd(event: PointerEvent) {
    const { drag } = this;
    if (!drag) return;
    event.stopImmediatePropagation();
    const { element, controls } = this.view;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    this.drag = null;
    controls.enabled = true;
    element.style.cursor = 'grab';
    if (drag.kind === 'handle') this.host.onHandleRelease?.(drag.handle);
  }
}
