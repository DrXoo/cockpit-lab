// The Three.js scene: renderer, camera, lights, the labels overlay and pointer interaction.
// What is drawn comes from render-model.ts; three-adapter.ts turns it into objects.
import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import type { RoomConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { inversePoint } from './geometry.ts';
import { hitAlongRay, type PartHit } from './cad/picking.ts';
import type { Face, ResolvedPart } from './cad/assembly.ts';

/** A point on the page, in CSS pixels from its top left corner. */
export interface PagePoint {
  x: number;
  y: number;
}
import { draggedPosition, pickLayoutItem, type LayoutGrab } from './layout-picking.ts';
import type { CockpitDrawing } from './render-cad.ts';
import type { ArmHandle } from './render-desk.ts';
import { createRenderList, labelShownIn, ROOT, type SceneLabel } from './render-list.ts';
import { drawHover } from './render-hover.ts';
import { distanceAlongAxis, type Handle } from './cad/handles.ts';
import type { JointMarker } from './cad/joint-markers.ts';
import { handleBallMm } from './render-handles.ts';
import { renderModel } from './render-model.ts';
import {
  cameraPose,
  designBounds,
  floorHeightCm,
  sceneBounds,
  viewHeight,
  type Framing,
  type SceneBounds,
  type SceneView,
} from './scene-camera.ts';
import { readSceneTheme, type SceneTheme } from './scene-theme.ts';
import { addPrimitives, type Palette } from './three-adapter.ts';
import { MM_PER_CM } from './units.ts';

type ArmJoint = ArmHandle['id'];

/** A label and the element that shows it. */
interface LabelItem extends SceneLabel {
  el: HTMLDivElement;
  position: T.Vector3;
}

/** A monitor arm joint, a layout item or a handle of a part, being dragged. */
type Drag =
  | { kind: 'arm'; joint: ArmJoint }
  | { kind: 'layout'; grab: LayoutGrab }
  | { kind: 'handle'; handle: Handle; grabbedAtMm: number };

/** How far an element kept beside a point stands from it, and from the edges of the view. */
const ANCHORED_GAP_PX = 16;
const ANCHORED_MARGIN_PX = 8;
const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(value, Math.max(min, max)));

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

/** How far along a move handle's axis the point is that sets its arrow's direction on screen. */
const ARROW_DIRECTION_CM = 10;
/** An arrow shorter than this on screen points at the camera: it cannot be dragged. */
const ARROW_HIDDEN_BELOW_PX = 1;
/** Arrows start this far out of the part's center, so a click on the center still picks it. */
const ARROW_START_PX = 10;
/** The length of a move arrow, unless a ball lies ahead of it. */
const ARROW_LENGTH_PX = 48;
/** Short of this, an arrow would be little more than its head. */
const ARROW_MIN_LENGTH_PX = 24;
/** How far short of a ball ahead of it an arrow stops: the ball's radius and a gap. */
const BALL_CLEARANCE_PX = 12;
/** A ball this close to the line of an arrow lies ahead of it. */
const AHEAD_WITHIN_PX = 12;

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
};

/**
 * How long an arrow out of `from` in `direction` on screen is drawn: short of the nearest ball
 * ahead of it, so the two never cover each other, but never shorter than an arrow can be.
 */
function arrowLengthPx(
  from: { x: number; y: number },
  direction: { x: number; y: number },
  balls: readonly { x: number; y: number }[],
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

interface ScreenPoint {
  x: number;
  y: number;
}

/** A joint marker this near the center of the selected part would cover where its arrows start. */
const MARKER_CLEARANCE_PX = 22;

/**
 * Where a joint marker at `at` is drawn: where it is, unless it lies on the center of the
 * selected part, where it moves out to the side its arrows leave most room on.
 */
function clearOfCenter(
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

/** An element of the page kept beside a point of the scene, such as the box of a change. */
interface AnchoredItem {
  el: HTMLElement;
  position: T.Vector3;
  /** A point the element keeps clear of, such as the tip of the arrow being dragged. */
  clearOf: T.Vector3 | null;
}

/**
 * How a handle is being dragged: whether Shift is held, which moves both ends or only one, and
 * Alt, which drops the steps and the snapping; a snap reaches as far along the handle as a few
 * pixels on screen cover where it is.
 */
export interface HandleModifiers {
  shiftHeld: boolean;
  free: boolean;
  snapWithinMm: number;
}

/** How near on screen a dragged handle comes to a place before it snaps there. */
const SNAP_WITHIN_PX = 10;
/** A handle seen almost end on would snap from afar: it never snaps from further than this. */
const MAX_SNAP_WITHIN_MM = 50;
/** How far along a handle the screen scale of its axis is measured. */
const SNAP_SCALE_SPAN_MM = 100;

/** The parts of the surroundings whose colors follow the theme. */
interface Environment {
  hemisphere: T.HemisphereLight;
  ground: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial | T.MeshStandardMaterial>;
  grid: T.GridHelper;
}

const MAX_PIXEL_RATIO = 2;
/** An arm joint can be grabbed this many px from its marker or from its label. */
const ARM_HANDLE_GRAB_RADIUS_PX = 20;
const ARM_HANDLE_LABEL_OFFSET_PX = -20;
/** The arm markers float this far above the joints. */
const ARM_HANDLE_LIFT_CM = 3;
/** Labels a little outside the viewport stay visible, so they do not flicker at the edges. */
const LABEL_VIEWPORT_MARGIN = 1.04;
const PRIMARY_BUTTON = 0;
/** A press that moves less than this before it is released is a click, not an orbit or a pan. */
const CLICK_TOLERANCE_PX = 4;

const isPlanView = (view: SceneView) => view === 'top' || view === 'desk';

/** The scene colors defined by the page's stylesheet. */
const themeOfPage = () =>
  readSceneTheme((token) => getComputedStyle(document.documentElement).getPropertyValue(token));

function createRenderer(background: string): {
  renderer: T.WebGLRenderer | SVGRenderer;
  vectorFallback: boolean;
} {
  const canvas = document.createElement('canvas');
  let context: WebGL2RenderingContext | null = null;
  try {
    context = canvas.getContext('webgl2', { antialias: true, alpha: false });
  } catch {
    // Without WebGL 2 the scene falls back to the SVG renderer.
  }
  if (!context) {
    const renderer = new SVGRenderer();
    renderer.setQuality('high');
    // The SVG renderer ignores the alpha.
    renderer.setClearColor(new T.Color(background), 1);
    return { renderer, vectorFallback: true };
  }
  const renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.5;
  return { renderer, vectorFallback: false };
}

function createPalette(vectorFallback: boolean): Palette {
  const screen = new T.MeshBasicMaterial({ map: screenTexture() });
  if (vectorFallback) screen.color.set('#253d33');
  return {
    silver: new T.MeshStandardMaterial({ color: 0xb8beb7, metalness: 0.7, roughness: 0.38 }),
    edge: new T.LineBasicMaterial({ color: 0x7e8b77, transparent: true, opacity: 0.55 }),
    dark: new T.MeshStandardMaterial({ color: 0x252d2a, metalness: 0.25, roughness: 0.7 }),
    seat: new T.MeshStandardMaterial({ color: 0x303936, roughness: 0.95 }),
    fabric: new T.MeshStandardMaterial({ color: 0x404b43, roughness: 1 }),
    orange: new T.MeshStandardMaterial({ color: 0xca6036, metalness: 0.2, roughness: 0.65 }),
    rubber: new T.MeshStandardMaterial({ color: 0x222a23, roughness: 1 }),
    groove: new T.MeshStandardMaterial({ color: 0x7e887c, metalness: 0.5, roughness: 0.7 }),
    wood: new T.MeshStandardMaterial({ color: 0xc3ad87, roughness: 0.75 }),
    desk: new T.MeshStandardMaterial({ color: 0xe1e4dc, roughness: 0.6, metalness: 0.25 }),
    blue: new T.MeshStandardMaterial({
      color: 0x8b9da7,
      transparent: true,
      opacity: 0.6,
      roughness: 1,
    }),
    dim: new T.LineBasicMaterial({ color: 0x9ba78d, transparent: true, opacity: 0.85 }),
    arm: new T.MeshStandardMaterial({ color: 0x4f5951, metalness: 0.6, roughness: 0.4 }),
    screen,
    selected: new T.MeshStandardMaterial({ color: 0xca6036, metalness: 0.45, roughness: 0.45 }),
    preview: new T.MeshStandardMaterial({
      color: 0xca6036,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      roughness: 0.6,
    }),
    // Blue, apart from the accent of the selection, so a hovered face shows on a selected part.
    hover: new T.MeshBasicMaterial({
      color: 0x2f7fd0,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  };
}

/** A sim racing screen drawn on a canvas, so the viewer needs no image files. */
function screenTexture(): T.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 440;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('A 2D canvas is needed to draw the monitor screen');
  const g = ctx.createLinearGradient(0, 0, 0, 440);
  g.addColorStop(0, '#253b36');
  g.addColorStop(1, '#172b26');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 440);
  ctx.strokeStyle = '#506453';
  ctx.lineWidth = 1;
  for (let i = 0; i < 24; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 80 - 400, 440);
    ctx.lineTo(512 + (i * 80 - 400 - 512) * 0.12, 150);
    ctx.stroke();
  }
  for (let y = 170; y < 440; y += y / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  ctx.strokeStyle = '#c47b48';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(430, 440);
  ctx.bezierCurveTo(700, 290, 300, 290, 530, 158);
  ctx.stroke();
  ctx.fillStyle = '#aabb9b';
  ctx.font = '500 16px monospace';
  ctx.fillText('COCKPIT LAB', 35, 43);
  ctx.font = '12px monospace';
  ctx.fillStyle = '#8eaa91';
  ctx.fillText('SIMULATION / READY', 35, 67);
  ctx.fillStyle = '#d49262';
  ctx.fillRect(943, 30, 45, 3);
  ctx.font = '70px monospace';
  ctx.fillStyle = '#c5d0b6';
  ctx.fillText('N', 40, 370);
  ctx.font = '13px monospace';
  ctx.fillStyle = '#99ab8d';
  ctx.fillText('000 KM/H', 40, 400);
  const texture = new T.CanvasTexture(c);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}

/** The ground sits just under the grid, so the grid lines stay on top of it. */
const GROUND_BELOW_GRID_CM = -0.25;

/** Ground, grid and lights, which do not depend on the configuration. */
function addEnvironment(scene: T.Scene, vectorFallback: boolean, theme: SceneTheme): Environment {
  const hemisphere = new T.HemisphereLight(0xffffff, theme.groundLight, vectorFallback ? 0 : 2.5);
  scene.add(hemisphere);
  const sun = new T.DirectionalLight(0xffffff, vectorFallback ? 0.65 : 3.2);
  sun.position.set(-150, 300, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -280,
    right: 280,
    top: 280,
    bottom: -280,
    near: 1,
    far: 800,
  });
  sun.shadow.normalBias = 0.4;
  sun.shadow.bias = -0.0004;
  sun.shadow.radius = 4;
  scene.add(sun);
  scene.add(new T.AmbientLight(0xffffff, vectorFallback ? 0.7 : 0.3));
  const ground = new T.Mesh(
    new T.PlaneGeometry(1500, 1500),
    vectorFallback
      ? new T.MeshBasicMaterial({ color: theme.background })
      : new T.MeshStandardMaterial({ color: theme.background, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_BELOW_GRID_CM;
  ground.receiveShadow = true;
  if (!vectorFallback) scene.add(ground);
  const grid = createGrid(theme);
  scene.add(grid);
  return { hemisphere, ground, grid };
}

function createGrid(theme: SceneTheme): T.GridHelper {
  const grid = new T.GridHelper(800, 80, theme.gridCenter, theme.grid);
  grid.position.set(0, 0, 50);
  grid.material.transparent = true;
  grid.material.opacity = 0.65;
  grid.renderOrder = -1;
  return grid;
}

export class CockpitScene {
  declare container: HTMLElement;
  declare labels: HTMLElement;
  declare scene: T.Scene;
  declare camera: T.OrthographicCamera;
  declare renderer: T.WebGLRenderer | SVGRenderer;
  declare controls: OrbitControls;
  declare vectorFallback: boolean;
  declare mat: Palette;
  declare theme: SceneTheme;
  declare environment: Environment;
  declare resizeObserver: ResizeObserver;
  declare view: SceneView;
  declare dimensions: boolean;
  declare layoutEditing: boolean;
  declare layoutTarget: string;
  declare roomEditing: boolean;
  /** The configuration last drawn, with its evaluation and extent. */
  declare s: RoomConfig | null;
  declare e: CockpitEvaluation | null;
  /** The cockpit design drawn on its own, if any. */
  declare cockpit: CockpitDrawing | null;
  /** Clicking picks a part of the cockpit design. */
  declare partPicking: boolean;
  /** Where a press that may become a click started. */
  declare press: { pointerId: number; x: number; y: number } | null;
  declare sceneBounds: SceneBounds | null;
  declare root: T.Group | null;
  declare dims: T.Object3D | null;
  declare labelItems: LabelItem[];
  declare armHandles: ArmHandle[];
  declare drag: Drag | null;
  /** Bumped whenever the drawing changes, so the next frame renders again. */
  declare revision: number;
  declare lastSignature: string;
  declare onArmMove: ((joint: ArmJoint, x: number, z: number) => void) | undefined;
  declare onLayoutMove: ((target: string, x: number, z: number) => void) | undefined;
  declare onLayoutSelect: ((target: string) => void) | undefined;
  /** A click picked a part of the cockpit design, at a face, or nothing (null). */
  declare onPartPick: ((hit: PartHit | null) => void) | undefined;
  /**
   * The pointer moved over the cockpit design: the part it marks, or null, and where the pointer
   * is on the page.
   */
  declare onPartHover: ((hit: PartHit | null, pointer: PagePoint) => void) | undefined;
  /** What marks the part or face under the pointer, drawn apart from the design. */
  declare hoverRoot: T.Group | null;
  /** The part and face marked under the pointer, to redraw only when they change. */
  declare hoverKey: string;
  declare handleItems: HandleItem[];
  /** The elements kept beside a point of the scene, such as the box of a change. */
  declare anchored: Map<HTMLElement, AnchoredItem>;
  /** A click on the marker of a joint, to open its card. */
  declare onJointMarkerPick: ((marker: JointMarker) => void) | undefined;
  /** A handle of the selected part was grabbed. */
  declare onHandleGrab: ((handle: Handle) => void) | undefined;
  /** A grabbed handle moved this far along its axis, out of the end, since it was grabbed. */
  declare onHandleDrag:
    ((handle: Handle, movedMm: number, modifiers: HandleModifiers) => void) | undefined;
  /** A grabbed handle was let go. */
  declare onHandleRelease: ((handle: Handle) => void) | undefined;

  constructor(container: HTMLElement, labels: HTMLElement) {
    this.container = container;
    this.labels = labels;
    this.dimensions = true;
    this.view = 'iso';
    this.layoutEditing = false;
    this.layoutTarget = 'desk';
    this.roomEditing = false;
    this.s = null;
    this.e = null;
    this.cockpit = null;
    this.partPicking = false;
    this.press = null;
    this.sceneBounds = null;
    this.root = null;
    this.dims = null;
    this.labelItems = [];
    this.armHandles = [];
    this.drag = null;
    this.lastSignature = '';
    this.onArmMove = undefined;
    this.onLayoutMove = undefined;
    this.onLayoutSelect = undefined;
    this.onPartPick = undefined;
    this.onPartHover = undefined;
    this.hoverRoot = null;
    this.hoverKey = '';
    this.handleItems = [];
    this.anchored = new Map();
    this.onJointMarkerPick = undefined;
    this.onHandleGrab = undefined;
    this.onHandleDrag = undefined;
    this.onHandleRelease = undefined;
    this.theme = themeOfPage();
    this.scene = new T.Scene();
    this.scene.background = new T.Color(this.theme.background);
    this.camera = new T.OrthographicCamera(-180, 180, 180, -180, 0.1, 2000);
    const { renderer, vectorFallback } = createRenderer(this.theme.background);
    this.renderer = renderer;
    this.vectorFallback = vectorFallback;
    const element = renderer.domElement;
    element.setAttribute(
      'aria-label',
      'View of the project and the items added. Use the buttons to switch between 3D and the plan; drag to orbit or arrange.',
    );
    element.tabIndex = 0;
    container.prepend(element);
    this.controls = new OrbitControls(this.camera, element);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 4;
    this.controls.enablePan = true;
    this.environment = addEnvironment(this.scene, vectorFallback, this.theme);
    this.mat = createPalette(vectorFallback);
    this.revision = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.installLayoutDrag();
    this.animate();
  }

  private framing(): Framing | null {
    return this.s && this.e && this.sceneBounds
      ? { state: this.s, evaluation: this.e, bounds: this.sceneBounds }
      : null;
  }

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.setFrustum();
    this.revision++;
  }

  setFrustum() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const size = viewHeight(this.view, aspect, this.framing());
    this.camera.left = (-size * aspect) / 2;
    this.camera.right = (size * aspect) / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
  }

  private addLabels(labels: readonly SceneLabel[]) {
    for (const label of labels) {
      const el = document.createElement('div');
      el.className = 'dim-label' + (label.object ? ' object-label' : '');
      if (label.className) el.classList.add(label.className);
      if (label.measures) el.dataset.measures = label.measures;
      el.textContent = label.text;
      this.labels.append(el);
      const { x, y, z } = label.position;
      this.labelItems.push({ ...label, el, position: new T.Vector3(x, y, z) });
    }
  }

  /** Frees what the previous drawing created; the palette is shared and kept. */
  /**
   * An element over the view for each handle, which a press grabs: a ball for an end, an arrow
   * out of a dot at the part's center for each axis it moves along.
   */
  private addHandles(handles: readonly Handle[]) {
    const center = handles.find((handle) => handle.kind === 'move');
    if (center) {
      const dot = document.createElement('span');
      dot.className = 'move-center';
      this.labels.append(dot);
      this.handleItems.push({ kind: 'center', el: dot, position: this.handleBall(center) });
    }
    for (const handle of handles) {
      const el = document.createElement('span');
      el.className = handle.kind === 'move' ? 'move-arrow' : 'part-handle';
      el.dataset.handle = handle.id;
      el.dataset.handleKind = handle.kind;
      el.title = HANDLE_TITLES[handle.kind];
      el.addEventListener('pointerdown', (event) => this.grabHandle(event, handle));
      this.labels.append(el);
      const position = this.handleBall(handle);
      if (handle.kind !== 'move') {
        this.handleItems.push({ kind: 'ball', el, position });
        continue;
      }
      el.dataset.axis = handle.axis;
      const { outwardMm } = handle;
      const toward = new T.Vector3(outwardMm.x, outwardMm.y, outwardMm.z)
        .multiplyScalar(ARROW_DIRECTION_CM)
        .add(position);
      this.handleItems.push({ kind: 'arrow', el, position, toward });
    }
  }

  /** A button over the view for each joint marker, with its symbol, which opens its card. */
  private addJointMarkers(markers: readonly JointMarker[]) {
    for (const marker of markers) {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'joint-marker';
      el.dataset.jointMarker = marker.id;
      el.dataset.state = marker.state;
      el.textContent = JOINT_MARKER_SYMBOLS[marker.state];
      el.title = JOINT_MARKER_TITLES[marker.state];
      el.setAttribute('aria-label', JOINT_MARKER_TITLES[marker.state]);
      el.addEventListener('click', () => this.onJointMarkerPick?.(marker));
      this.labels.append(el);
      const { pointMm } = marker;
      const position = new T.Vector3(
        pointMm.x / MM_PER_CM,
        pointMm.y / MM_PER_CM,
        pointMm.z / MM_PER_CM,
      );
      this.handleItems.push({ kind: 'joint', el, position });
    }
  }

  /** Where a handle is drawn, in the scene's cm. */
  private handleBall(handle: Handle): T.Vector3 {
    const ball = handleBallMm(handle);
    return new T.Vector3(ball.x / MM_PER_CM, ball.y / MM_PER_CM, ball.z / MM_PER_CM);
  }

  /** Keeps an element of the page beside a point of the scene, in cm, or lets it go (null). */
  anchorElement(
    el: HTMLElement,
    pointCm: { x: number; y: number; z: number } | null,
    clearOfCm: { x: number; y: number; z: number } | null = null,
  ) {
    const vector = (cm: { x: number; y: number; z: number }) => new T.Vector3(cm.x, cm.y, cm.z);
    if (pointCm === null) this.anchored.delete(el);
    else
      this.anchored.set(el, {
        el,
        position: vector(pointCm),
        clearOf: clearOfCm ? vector(clearOfCm) : null,
      });
    this.revision++;
  }

  private grabHandle(event: PointerEvent, handle: Handle) {
    if (event.button !== PRIMARY_BUTTON) return;
    const grabbedAtMm = this.alongHandle(event, handle);
    if (grabbedAtMm === null) return;
    // A press on a handle drags it: it neither orbits nor picks the part under it.
    this.press = null;
    this.clearHover();
    this.startDrag(event, { kind: 'handle', handle, grabbedAtMm });
    this.onHandleGrab?.(handle);
  }

  /** Where the pointer is along the axis of a handle, from the end it changes. */
  private alongHandle(event: PointerEvent, handle: Handle): number | null {
    const { origin, direction } = this.rayAt(event);
    return distanceAlongAxis(
      {
        originMm: { x: origin.x * MM_PER_CM, y: origin.y * MM_PER_CM, z: origin.z * MM_PER_CM },
        directionMm: { x: direction.x, y: direction.y, z: direction.z },
      },
      handle.pointMm,
      handle.outwardMm,
    );
  }

  /** How many mm along a handle's axis `SNAP_WITHIN_PX` on screen cover where the handle is. */
  private snapWithinMm({ pointMm, outwardMm }: Handle): number {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const onScreen = (alongMm: number) => {
      const p = new T.Vector3(
        (pointMm.x + outwardMm.x * alongMm) / MM_PER_CM,
        (pointMm.y + outwardMm.y * alongMm) / MM_PER_CM,
        (pointMm.z + outwardMm.z * alongMm) / MM_PER_CM,
      ).project(this.camera);
      return { x: p.x * 0.5 * w, y: p.y * 0.5 * h };
    };
    const from = onScreen(0);
    const to = onScreen(SNAP_SCALE_SPAN_MM);
    const pxPerMm = Math.hypot(to.x - from.x, to.y - from.y) / SNAP_SCALE_SPAN_MM;
    return pxPerMm > 0 ? Math.min(SNAP_WITHIN_PX / pxPerMm, MAX_SNAP_WITHIN_MM) : 0;
  }

  private disposeDrawing(root: T.Object3D) {
    const shared = new Set<T.Material>(Object.values(this.mat));
    root.traverse((object) => {
      if (!(object instanceof T.Mesh || object instanceof T.Line)) return;
      object.geometry.dispose();
      const materials: T.Material[] = [object.material].flat();
      for (const material of materials) if (!shared.has(material)) material.dispose();
    });
  }

  /** Draws a configuration, or a cockpit design on its own with the empty configuration `s`. */
  update(s: RoomConfig, e: CockpitEvaluation, cockpit: CockpitDrawing | null = null) {
    this.revision++;
    this.s = s;
    this.e = e;
    this.cockpit = cockpit;
    this.sceneBounds = cockpit ? designBounds(cockpit.resolved) : sceneBounds(s, e);
    this.placeFloor();
    if (this.root) {
      this.disposeDrawing(this.root);
      this.scene.remove(this.root);
    }
    this.labels.innerHTML = '';
    this.labelItems = [];
    this.handleItems = [];
    const root = new T.Group();
    this.root = root;
    this.scene.add(root);
    const model = renderModel(s, e, {
      view: this.view,
      layoutEditing: this.layoutEditing,
      layoutTarget: this.layoutTarget,
      roomFloor: this.theme.roomFloor,
      cockpit,
    });
    this.dims = addPrimitives(model.primitives, root, this.mat).dimensions;
    if (this.dims) this.dims.visible = this.dimensions;
    this.addLabels(model.labels);
    this.addJointMarkers(cockpit?.jointMarkers ?? []);
    this.addHandles(cockpit?.handles ?? []);
    this.armHandles = model.armHandles;
    this.setFrustum();
    // Handles are placed at once, so a ball is never grabbed where it was before it is drawn.
    this.camera.updateMatrixWorld();
    this.placeOverlays(this.container.clientWidth, this.container.clientHeight);
    // The parts may have changed: the next move of the pointer marks them again.
    this.clearHover();
  }

  /** Puts the ground and the grid at the floor of what the scene shows. */
  private placeFloor() {
    const floorCm = this.sceneBounds ? floorHeightCm(this.sceneBounds) : 0;
    this.environment.grid.position.y = floorCm;
    this.environment.ground.position.y = floorCm + GROUND_BELOW_GRID_CM;
  }

  /** Takes the scene colors from the stylesheet again, after the interface theme changed. */
  applyTheme() {
    const theme = themeOfPage();
    if (JSON.stringify(theme) === JSON.stringify(this.theme)) return;
    this.theme = theme;
    this.scene.background = new T.Color(theme.background);
    if (this.renderer instanceof SVGRenderer)
      this.renderer.setClearColor(new T.Color(theme.background), 1);
    const { hemisphere, ground, grid } = this.environment;
    hemisphere.groundColor.set(theme.groundLight);
    ground.material.color.set(theme.background);
    this.scene.remove(grid);
    grid.dispose();
    const next = createGrid(theme);
    this.scene.add(next);
    this.environment = { hemisphere, ground, grid: next };
    this.placeFloor();
    this.revision++;
    this.redraw();
  }

  /** Rebuilds the drawing for the current options, once there is something to draw. */
  private redraw() {
    if (this.s && this.e) this.update(this.s, this.e, this.cockpit);
  }

  setView(view: SceneView) {
    this.view = view;
    const framing = this.framing();
    if (!framing) return;
    const pose = cameraPose(view, framing);
    this.camera.zoom = 1;
    this.controls.target.set(pose.target.x, pose.target.y, pose.target.z);
    this.controls.enableRotate = pose.rotate;
    this.controls.mouseButtons.LEFT = pose.rotate ? T.MOUSE.ROTATE : T.MOUSE.PAN;
    this.camera.up.set(pose.up.x, pose.up.y, pose.up.z);
    this.camera.position.set(pose.position.x, pose.position.y, pose.position.z);
    [this.controls.minPolarAngle, this.controls.maxPolarAngle] = pose.polar;
    this.camera.lookAt(this.controls.target);
    this.setFrustum();
    this.controls.update();
    this.redraw();
  }

  setLayoutEditing(on: boolean, target = 'desk', roomEditing = false) {
    this.roomEditing = roomEditing;
    this.layoutEditing = on;
    this.layoutTarget = target;
    this.renderer.domElement.style.cursor = on && isPlanView(this.view) ? 'grab' : '';
    this.redraw();
  }

  /** Lets a click pick a part of the cockpit design drawn on its own. */
  setPartPicking(on: boolean) {
    this.partPicking = on;
    this.press = null;
  }

  setDimensions(on: boolean) {
    this.revision++;
    this.dimensions = on;
    if (this.dims) this.dims.visible = on;
    for (const item of this.labelItems) item.el.hidden = !on && !item.alwaysShown;
  }

  /** The ray from the camera through the point under the pointer, in world cm. */
  private rayAt(event: PointerEvent): T.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
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
    if (!this.cockpit) return null;
    const { origin, direction } = this.rayAt(event);
    const { resolved, previewPartId } = this.cockpit;
    // A part about to be added is only a preview: clicks go through it.
    const pickable = new Map([...resolved].filter(([partId]) => partId !== previewPartId));
    return hitAlongRay(pickable, {
      originMm: { x: origin.x * MM_PER_CM, y: origin.y * MM_PER_CM, z: origin.z * MM_PER_CM },
      directionMm: { x: direction.x, y: direction.y, z: direction.z },
    });
  }

  /** The arm joint whose marker or label is under the pointer. */
  private armHandleAt(event: PointerEvent): ArmHandle | undefined {
    const r = this.renderer.domElement.getBoundingClientRect();
    return this.armHandles
      .map((handle) => {
        const { x, y, z } = handle.point;
        const q = new T.Vector3(x, y + ARM_HANDLE_LIFT_CM, z).project(this.camera);
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
    this.controls.enabled = false;
    this.drag = drag;
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = 'grabbing';
  }

  /**
   * Marks the part under the pointer, or, while a part is about to be added to another, the face
   * of that part a click would choose. Nothing is marked while a button is held.
   */
  private hoverAt(event: PointerEvent) {
    const cockpit = this.cockpit;
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
      this.drawHoverMark(resolved ? { resolved, face } : null);
    }
    this.onPartHover?.(marked, { x: event.clientX, y: event.clientY });
  }

  private clearHover() {
    if (this.hoverKey === '' && this.hoverRoot === null) return;
    this.hoverKey = '';
    this.drawHoverMark(null);
    this.onPartHover?.(null, { x: 0, y: 0 });
  }

  private drawHoverMark(mark: { resolved: ResolvedPart; face: Face | null } | null) {
    if (this.hoverRoot) {
      this.disposeDrawing(this.hoverRoot);
      this.scene.remove(this.hoverRoot);
      this.hoverRoot = null;
    }
    if (mark) {
      const r = createRenderList();
      drawHover(r, ROOT, mark.resolved, mark.face);
      const group = new T.Group();
      addPrimitives(r.primitives, group, this.mat);
      this.scene.add(group);
      this.hoverRoot = group;
    }
    this.revision++;
  }

  private onPointerDown(event: PointerEvent) {
    this.clearHover();
    if (this.partPicking && event.button === PRIMARY_BUTTON)
      this.press = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    const s = this.s;
    const e = this.e;
    if (!s || !e) return;
    if (!this.layoutEditing || !isPlanView(this.view) || event.button !== PRIMARY_BUTTON) return;
    const floor = this.pointerOnPlane(event);
    const top = this.pointerOnPlane(event, s.deskH);
    if (!floor || !top) return;
    if (this.layoutTarget === 'arm' && s.deskEnabled !== false && s.monitorEnabled !== false) {
      const handle = this.armHandleAt(event);
      if (handle) {
        this.startDrag(event, { kind: 'arm', joint: handle.id });
        return;
      }
    }
    const grab = pickLayoutItem(floor, top, s, e, {
      layoutTarget: this.layoutTarget,
      roomEditing: this.roomEditing,
    });
    if (!grab) return;
    this.layoutTarget = grab.target;
    this.onLayoutSelect?.(grab.target);
    this.startDrag(event, { kind: 'layout', grab });
  }

  private onPointerMove(event: PointerEvent) {
    const drag = this.drag;
    const s = this.s;
    const e = this.e;
    if (!drag) {
      this.hoverAt(event);
      return;
    }
    if (drag.kind === 'handle') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const alongMm = this.alongHandle(event, drag.handle);
      if (alongMm !== null)
        this.onHandleDrag?.(drag.handle, alongMm - drag.grabbedAtMm, {
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
      if (p) this.onArmMove?.(drag.joint, p.x, p.z);
      return;
    }
    const { grab } = drag;
    const p = this.pointerOnPlane(event, grab.desktop ? s.deskH : 0);
    if (!p) return;
    const { x, z } = draggedPosition(grab, grab.desktop ? inversePoint(p, e.deskPose) : p);
    this.onLayoutMove?.(grab.target, x, z);
  }

  /** A press released where it started picks the part under it. */
  private onPointerUp(event: PointerEvent) {
    const press = this.press;
    this.press = null;
    if (!this.partPicking || !press || press.pointerId !== event.pointerId) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved <= CLICK_TOLERANCE_PX) this.onPartPick?.(this.partAt(event));
  }

  private onPointerEnd(event: PointerEvent) {
    const drag = this.drag;
    if (!drag) return;
    event.stopImmediatePropagation();
    const element = this.renderer.domElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    this.drag = null;
    this.controls.enabled = true;
    element.style.cursor = 'grab';
    if (drag.kind === 'handle') this.onHandleRelease?.(drag.handle);
  }

  /** Capture-phase listeners, so a drag stops the orbit controls from panning. */
  installLayoutDrag() {
    const element: GlobalEventHandlers = this.renderer.domElement;
    element.addEventListener('pointerdown', (event) => this.onPointerDown(event), true);
    element.addEventListener('pointermove', (event) => this.onPointerMove(event), true);
    element.addEventListener('pointerup', (event) => this.onPointerUp(event), true);
    element.addEventListener('pointerup', (event) => this.onPointerEnd(event), true);
    element.addEventListener('pointercancel', (event) => this.onPointerEnd(event), true);
    element.addEventListener('pointerleave', () => this.clearHover());
  }

  /** Renders only when the camera, the size or the drawing changed. */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.camera.updateMatrixWorld();
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const signature = [
      ...this.camera.matrixWorld.elements,
      ...this.camera.projectionMatrix.elements,
      w,
      h,
      this.revision,
      this.view,
    ].join(',');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.renderer.render(this.scene, this.camera);
    this.placeLabels(w, h);
  }

  /** Puts the handles, and the element kept beside a point, where the camera shows them. */
  private placeOverlays(w: number, h: number) {
    const onScreen = (point: T.Vector3) => {
      const p = point.clone().project(this.camera);
      return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, inView: p.z >= -1 && p.z <= 1 };
    };
    const placed = this.handleItems.map((item) => ({ item, at: onScreen(item.position) }));
    const balls = placed.filter(({ item }) => item.kind === 'ball').map(({ at }) => at);
    const arrowDirections: ScreenPoint[] = [];
    for (const { item, at } of placed) {
      item.el.hidden = !at.inView;
      item.el.style.left = `${at.x}px`;
      item.el.style.top = `${at.y}px`;
      if (!item.toward) continue;
      const tip = onScreen(item.toward);
      const lengthPx = Math.hypot(tip.x - at.x, tip.y - at.y);
      item.el.hidden ||= lengthPx < ARROW_HIDDEN_BELOW_PX;
      const direction = { x: (tip.x - at.x) / lengthPx, y: (tip.y - at.y) / lengthPx };
      if (!item.el.hidden) arrowDirections.push(direction);
      item.el.style.width = `${arrowLengthPx(at, direction, balls)}px`;
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
    for (const item of this.anchored.values()) this.placeAnchored(item, w, h);
  }

  /**
   * Puts an element beside its point, to the right of it unless it would leave the view, and
   * always whole within the view, so it never has to be scrolled to.
   */
  private placeAnchored({ el, position, clearOf }: AnchoredItem, w: number, h: number) {
    const p = position.clone().project(this.camera);
    const x = (p.x * 0.5 + 0.5) * w;
    const y = (-p.y * 0.5 + 0.5) * h;
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const right = x + ANCHORED_GAP_PX;
    const leftOf = x - ANCHORED_GAP_PX - width;
    // A point to keep clear of on the right sends the element to the left, if it fits there.
    const clearOfX = clearOf ? (clearOf.clone().project(this.camera).x * 0.5 + 0.5) * w : x;
    const rightIsTaken = clearOfX > x + ANCHORED_GAP_PX / 2 && leftOf >= ANCHORED_MARGIN_PX;
    const rightFits = right + width <= w - ANCHORED_MARGIN_PX;
    const left = rightFits && !rightIsTaken ? right : leftOf;
    el.style.left = `${clamp(left, ANCHORED_MARGIN_PX, w - width - ANCHORED_MARGIN_PX)}px`;
    el.style.top = `${clamp(y - height / 2, ANCHORED_MARGIN_PX, h - height - ANCHORED_MARGIN_PX)}px`;
  }

  private placeLabels(w: number, h: number) {
    this.placeOverlays(w, h);
    for (const item of this.labelItems) {
      if (!this.dimensions && !item.armHandle && !item.alwaysShown) {
        item.el.hidden = true;
        continue;
      }
      const p = item.position.clone().project(this.camera);
      item.el.hidden =
        p.z < -1 ||
        p.z > 1 ||
        Math.abs(p.x) > LABEL_VIEWPORT_MARGIN ||
        Math.abs(p.y) > LABEL_VIEWPORT_MARGIN ||
        !labelShownIn(item, this.view);
      item.el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      item.el.style.top = `${(-p.y * 0.5 + 0.5) * h + (item.offsetY || 0)}px`;
    }
  }
}
