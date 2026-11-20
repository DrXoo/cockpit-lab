// The elements of the page drawn over the 3D view: the labels of the drawing, the handles of the
// selected part, the joint markers, and the elements kept beside a point of the scene. Each
// frame puts them where the camera shows their points.
import * as T from 'three';
import type { Handle } from '../cockpit/cad/interaction/handles.ts';
import type { JointMarker } from '../cockpit/cad/interaction/joint-markers.ts';
import { handleBallMm } from '../cockpit/render/handles.ts';
import { MM_PER_CM } from '../shared/units.ts';
import type { SceneView } from './camera.ts';
import {
  aboveOutline,
  arrowLengthPx,
  ARROW_START_PX,
  besidePoint,
  clearOfCenter,
  type ScreenPoint,
  type ScreenSize,
} from './overlay-layout.ts';
import { labelShownIn, type SceneLabel } from './render-list.ts';

/** A point of the scene, in cm. */
type PointCm = { x: number; y: number; z: number };

/** A label and the element that shows it. */
interface LabelItem extends SceneLabel {
  el: HTMLDivElement;
  position: T.Vector3;
}

/**
 * A handle of the selected part, shown on top of the view: a ball, or an arrow from `position`
 * that points to where `toward` is on screen.
 */
interface HandleItem {
  kind: 'ball' | 'center' | 'arrow' | 'joint';
  el: HTMLElement;
  position: T.Vector3;
  toward?: T.Vector3;
}

/**
 * An element of the page kept beside a point of the scene, such as the box of a change, or above
 * the outline some points make on screen, such as the corners of a part about to be added.
 */
type AnchoredItem =
  | {
      kind: 'beside';
      el: HTMLElement;
      position: T.Vector3;
      /** A point the element keeps clear of, such as the tip of the arrow being dragged. */
      clearOf: T.Vector3 | null;
    }
  | { kind: 'above'; el: HTMLElement; points: T.Vector3[] };

/** A point of the scene where the camera shows it, and whether it lies within the view. */
interface OnScreen extends ScreenPoint {
  inView: boolean;
}

/** How far along a move handle's axis the point is that sets its arrow's direction on screen. */
const ARROW_DIRECTION_CM = 10;
/** An arrow shorter than this on screen points at the camera: it cannot be dragged. */
const ARROW_HIDDEN_BELOW_PX = 1;
/** Labels a little outside the viewport stay visible, so they do not flicker at the edges. */
const LABEL_VIEWPORT_MARGIN = 1.04;

const JOINT_MARKER_SYMBOLS: Record<JointMarker['state'], string> = {
  pending: '⚠',
  fastened: '✓',
  touching: '+',
};
const JOINT_MARKER_TITLES: Record<JointMarker['state'], string> = {
  pending: 'Joint without connectors · click for its quick actions',
  fastened: 'Fastened joint · click for its connectors',
  touching: 'Touching, without a joint · click to join them',
};

const HANDLE_TITLES: Record<Handle['kind'], string> = {
  end: 'Drag to lengthen or shorten · Shift: both ends · Alt: to the millimetre',
  edge: 'Drag to widen or narrow on both sides · Shift: this edge only · Alt: to the millimetre',
  move: 'Drag to move along this axis · Alt: to the millimetre',
  travel: 'Drag to move it along its travel · Alt: to the millimetre',
};

const isArrow = (handle: Handle) => handle.kind === 'move' || handle.kind === 'travel';
const vectorOf = (cm: PointCm) => new T.Vector3(cm.x, cm.y, cm.z);
const cmOfMm = (mm: PointCm) => new T.Vector3(mm.x / MM_PER_CM, mm.y / MM_PER_CM, mm.z / MM_PER_CM);

export class SceneOverlays {
  /** The element over the view that holds the labels, the handles and the joint markers. */
  declare private readonly container: HTMLElement;
  declare private labelItems: LabelItem[];
  declare private handleItems: HandleItem[];
  declare private readonly anchored: Map<HTMLElement, AnchoredItem>;

  constructor(container: HTMLElement) {
    this.container = container;
    this.labelItems = [];
    this.handleItems = [];
    this.anchored = new Map();
  }

  /** Takes away the labels, the handles and the joint markers of the previous drawing. */
  clear() {
    this.container.innerHTML = '';
    this.labelItems = [];
    this.handleItems = [];
  }

  addLabels(labels: readonly SceneLabel[]) {
    for (const label of labels) {
      const el = document.createElement('div');
      el.className = 'dim-label' + (label.object ? ' object-label' : '');
      if (label.className) el.classList.add(label.className);
      if (label.measures) el.dataset.measures = label.measures;
      el.textContent = label.text;
      this.container.append(el);
      this.labelItems.push({ ...label, el, position: vectorOf(label.position) });
    }
  }

  /**
   * An element over the view for each handle, which a press grabs: a ball for an end, an arrow
   * out of a dot at the part's center for each axis it moves along, or along its travel.
   */
  addHandles(handles: readonly Handle[], grab: (event: PointerEvent, handle: Handle) => void) {
    const center = handles.find(isArrow);
    if (center) {
      const dot = document.createElement('span');
      dot.className = 'move-center';
      this.container.append(dot);
      this.handleItems.push({ kind: 'center', el: dot, position: cmOfMm(handleBallMm(center)) });
    }
    for (const handle of handles) {
      const el = document.createElement('span');
      el.className = isArrow(handle) ? 'move-arrow' : 'part-handle';
      el.dataset.handle = handle.id;
      el.dataset.handleKind = handle.kind;
      el.title = HANDLE_TITLES[handle.kind];
      el.addEventListener('pointerdown', (event) => grab(event, handle));
      this.container.append(el);
      const position = cmOfMm(handleBallMm(handle));
      if (handle.kind !== 'move' && handle.kind !== 'travel') {
        this.handleItems.push({ kind: 'ball', el, position });
        continue;
      }
      el.dataset.axis = handle.axis;
      const toward = vectorOf(handle.outwardMm).multiplyScalar(ARROW_DIRECTION_CM).add(position);
      this.handleItems.push({ kind: 'arrow', el, position, toward });
    }
  }

  /** A button over the view for each joint marker, with its symbol, which opens its card. */
  addJointMarkers(markers: readonly JointMarker[], pick: (marker: JointMarker) => void) {
    for (const marker of markers) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'joint-marker';
      el.dataset.jointMarker = marker.id;
      el.dataset.state = marker.state;
      el.textContent = JOINT_MARKER_SYMBOLS[marker.state];
      el.title = JOINT_MARKER_TITLES[marker.state];
      el.setAttribute('aria-label', JOINT_MARKER_TITLES[marker.state]);
      el.addEventListener('click', () => pick(marker));
      this.container.append(el);
      this.handleItems.push({ kind: 'joint', el, position: cmOfMm(marker.pointMm) });
    }
  }

  /** Keeps an element of the page beside a point of the scene, or lets it go (null). */
  anchorBeside(el: HTMLElement, pointCm: PointCm | null, clearOfCm: PointCm | null) {
    if (pointCm === null) this.anchored.delete(el);
    else
      this.anchored.set(el, {
        kind: 'beside',
        el,
        position: vectorOf(pointCm),
        clearOf: clearOfCm ? vectorOf(clearOfCm) : null,
      });
  }

  /** Keeps an element of the page above the outline some points make, or lets it go (null). */
  anchorAbove(el: HTMLElement, pointsCm: readonly PointCm[] | null) {
    if (pointsCm === null) this.anchored.delete(el);
    else this.anchored.set(el, { kind: 'above', el, points: pointsCm.map(vectorOf) });
  }

  /** Shows the labels of the dimensions, or only those that are always shown. */
  showDimensions(on: boolean) {
    for (const item of this.labelItems) item.el.hidden = !on && !item.alwaysShown;
  }

  /** Puts the handles, and the elements kept beside a point, where the camera shows them. */
  placeHandles(camera: T.Camera, view: ScreenSize) {
    const onScreen = (point: T.Vector3): OnScreen => {
      const p = point.clone().project(camera);
      return {
        x: (p.x * 0.5 + 0.5) * view.width,
        y: (-p.y * 0.5 + 0.5) * view.height,
        inView: p.z >= -1 && p.z <= 1,
      };
    };
    const placed = this.handleItems.map((item) => ({ item, at: onScreen(item.position) }));
    const balls = placed.filter(({ item }) => item.kind === 'ball').map(({ at }) => at);
    const arrowDirections: ScreenPoint[] = [];
    // Where the handles reach on screen, which a box kept above a part stays clear of.
    const handleReach: ScreenPoint[] = [];
    for (const { item, at } of placed) {
      item.el.hidden = !at.inView;
      item.el.style.left = `${at.x}px`;
      item.el.style.top = `${at.y}px`;
      if (!item.el.hidden) handleReach.push(at);
      if (!item.toward) continue;
      const tip = onScreen(item.toward);
      const lengthPx = Math.hypot(tip.x - at.x, tip.y - at.y);
      item.el.hidden ||= lengthPx < ARROW_HIDDEN_BELOW_PX;
      const direction = { x: (tip.x - at.x) / lengthPx, y: (tip.y - at.y) / lengthPx };
      const shownLengthPx = arrowLengthPx(at, direction, balls);
      if (!item.el.hidden) {
        arrowDirections.push(direction);
        const reachPx = ARROW_START_PX + shownLengthPx;
        handleReach.push({ x: at.x + direction.x * reachPx, y: at.y + direction.y * reachPx });
      }
      item.el.style.width = `${shownLengthPx}px`;
      const angleRad = Math.atan2(direction.y, direction.x);
      item.el.style.transform = `rotate(${angleRad}rad) translateX(${ARROW_START_PX}px)`;
    }
    const center = placed.find(({ item }) => item.kind === 'center')?.at;
    if (center) {
      const markers = placed.filter(({ item }) => item.kind === 'joint');
      for (const { item, at } of markers) {
        const moved = clearOfCenter(at, center, arrowDirections);
        item.el.style.left = `${moved.x}px`;
        item.el.style.top = `${moved.y}px`;
      }
    }
    for (const item of this.anchored.values()) placeAnchored(item, camera, view, handleReach);
  }

  /** Puts everything over the view where the camera shows it, labels included. */
  placeAll(camera: T.Camera, view: ScreenSize, shown: { dimensions: boolean; view: SceneView }) {
    this.placeHandles(camera, view);
    for (const item of this.labelItems) {
      if (!shown.dimensions && !item.armHandle && !item.alwaysShown) {
        item.el.hidden = true;
        continue;
      }
      const p = item.position.clone().project(camera);
      item.el.hidden =
        p.z < -1 ||
        p.z > 1 ||
        Math.abs(p.x) > LABEL_VIEWPORT_MARGIN ||
        Math.abs(p.y) > LABEL_VIEWPORT_MARGIN ||
        !labelShownIn(item, shown.view);
      item.el.style.left = `${(p.x * 0.5 + 0.5) * view.width}px`;
      item.el.style.top = `${(-p.y * 0.5 + 0.5) * view.height + (item.offsetY || 0)}px`;
    }
  }
}

/**
 * Puts an element beside its point, or above its outline and where the handles reach, always
 * whole within the view.
 */
function placeAnchored(
  item: AnchoredItem,
  camera: T.Camera,
  view: ScreenSize,
  handleReach: readonly ScreenPoint[],
) {
  const toScreen = (point: T.Vector3): ScreenPoint => {
    const p = point.clone().project(camera);
    return { x: (p.x * 0.5 + 0.5) * view.width, y: (-p.y * 0.5 + 0.5) * view.height };
  };
  const { el } = item;
  const box = { width: el.offsetWidth, height: el.offsetHeight };
  const corner =
    item.kind === 'above'
      ? aboveOutline([...item.points.map(toScreen), ...handleReach], box, view)
      : besidePoint(toScreen(item.position), box, view, item.clearOf && toScreen(item.clearOf).x);
  el.style.left = `${corner.x}px`;
  el.style.top = `${corner.y}px`;
}
