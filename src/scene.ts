// The Three.js scene: renderer, camera, lights, the labels overlay and pointer interaction.
// What is drawn comes from render-model.ts; three-adapter.ts turns it into objects.
import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import type { CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { inversePoint } from './geometry.ts';
import { draggedPosition, pickLayoutItem, type LayoutGrab } from './layout-picking.ts';
import type { ArmHandle } from './render-desk.ts';
import { labelShownIn, type SceneLabel } from './render-list.ts';
import { renderModel } from './render-model.ts';
import {
  cameraPose,
  sceneBounds,
  viewHeight,
  type Framing,
  type SceneBounds,
  type SceneView,
} from './scene-camera.ts';
import { addPrimitives, type Palette } from './three-adapter.ts';

type ArmJoint = ArmHandle['id'];

/** A label and the element that shows it. */
interface LabelItem extends SceneLabel {
  el: HTMLDivElement;
  position: T.Vector3;
}

/** A monitor arm joint, or a layout item, being dragged. */
type Drag = { kind: 'arm'; joint: ArmJoint } | { kind: 'layout'; grab: LayoutGrab };

const BACKGROUND = '#f0f2ec';
const MAX_PIXEL_RATIO = 2;
/** An arm joint can be grabbed this many px from its marker or from its label. */
const ARM_HANDLE_GRAB_RADIUS_PX = 20;
const ARM_HANDLE_LABEL_OFFSET_PX = -20;
/** The arm markers float this far above the joints. */
const ARM_HANDLE_LIFT_CM = 3;
/** Labels a little outside the viewport stay visible, so they do not flicker at the edges. */
const LABEL_VIEWPORT_MARGIN = 1.04;
const PRIMARY_BUTTON = 0;

const isPlanView = (view: SceneView) => view === 'top' || view === 'desk';

function createRenderer(): { renderer: T.WebGLRenderer | SVGRenderer; vectorFallback: boolean } {
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
    renderer.setClearColor(new T.Color(BACKGROUND), 1);
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

/** Ground, grid and lights, which do not depend on the configuration. */
function addEnvironment(scene: T.Scene, vectorFallback: boolean) {
  scene.add(new T.HemisphereLight(0xffffff, 0xb0b8a2, vectorFallback ? 0 : 2.5));
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
  const floor = new T.Mesh(
    new T.PlaneGeometry(1500, 1500),
    vectorFallback
      ? new T.MeshBasicMaterial({ color: BACKGROUND })
      : new T.MeshStandardMaterial({ color: BACKGROUND, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.25;
  floor.receiveShadow = true;
  if (!vectorFallback) scene.add(floor);
  const grid = new T.GridHelper(800, 80, 0xdde2d4, 0xe3e7dc);
  grid.position.set(0, 0, 50);
  grid.material.transparent = true;
  grid.material.opacity = 0.65;
  grid.renderOrder = -1;
  scene.add(grid);
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
  declare resizeObserver: ResizeObserver;
  declare view: SceneView;
  declare dimensions: boolean;
  declare person: boolean;
  declare layoutEditing: boolean;
  declare layoutTarget: string;
  declare roomEditing: boolean;
  /** The configuration last drawn, with its evaluation and extent. */
  declare s: CockpitConfig | null;
  declare e: CockpitEvaluation | null;
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

  constructor(container: HTMLElement, labels: HTMLElement) {
    this.container = container;
    this.labels = labels;
    this.dimensions = true;
    this.person = false;
    this.view = 'iso';
    this.layoutEditing = false;
    this.layoutTarget = 'cockpit';
    this.roomEditing = false;
    this.s = null;
    this.e = null;
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
    this.scene = new T.Scene();
    this.scene.background = new T.Color(BACKGROUND);
    this.camera = new T.OrthographicCamera(-180, 180, 180, -180, 0.1, 2000);
    const { renderer, vectorFallback } = createRenderer();
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
    addEnvironment(this.scene, vectorFallback);
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
      el.textContent = label.text;
      this.labels.append(el);
      const { x, y, z } = label.position;
      this.labelItems.push({ ...label, el, position: new T.Vector3(x, y, z) });
    }
  }

  /** Frees what the previous drawing created; the palette is shared and kept. */
  private disposeDrawing(root: T.Object3D) {
    const shared = new Set<T.Material>(Object.values(this.mat));
    root.traverse((object) => {
      if (!(object instanceof T.Mesh || object instanceof T.Line)) return;
      object.geometry.dispose();
      const materials: T.Material[] = [object.material].flat();
      for (const material of materials) if (!shared.has(material)) material.dispose();
    });
  }

  update(s: CockpitConfig, e: CockpitEvaluation) {
    this.revision++;
    this.s = s;
    this.e = e;
    this.sceneBounds = sceneBounds(s, e);
    if (this.root) {
      this.disposeDrawing(this.root);
      this.scene.remove(this.root);
    }
    this.labels.innerHTML = '';
    this.labelItems = [];
    const root = new T.Group();
    this.root = root;
    this.scene.add(root);
    const model = renderModel(s, e, {
      view: this.view,
      person: this.person,
      layoutEditing: this.layoutEditing,
      layoutTarget: this.layoutTarget,
    });
    this.dims = addPrimitives(model.primitives, root, this.mat).dimensions;
    if (this.dims) this.dims.visible = this.dimensions;
    this.addLabels(model.labels);
    this.armHandles = model.armHandles;
    this.setFrustum();
  }

  /** Rebuilds the drawing for the current options, once there is something to draw. */
  private redraw() {
    if (this.s && this.e) this.update(this.s, this.e);
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

  setLayoutEditing(on: boolean, target = 'cockpit', roomEditing = false) {
    this.roomEditing = roomEditing;
    this.layoutEditing = on;
    this.layoutTarget = target;
    this.renderer.domElement.style.cursor = on && isPlanView(this.view) ? 'grab' : '';
    this.redraw();
  }

  setDimensions(on: boolean) {
    this.revision++;
    this.dimensions = on;
    if (this.dims) this.dims.visible = on;
    for (const item of this.labelItems) item.el.hidden = !on;
  }

  setPerson(on: boolean) {
    this.person = on;
    this.redraw();
  }

  /** The point under the pointer on the horizontal plane at `height`. */
  private pointerOnPlane(event: PointerEvent, height = 0): T.Vector3 | null {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ray = new T.Raycaster();
    ray.setFromCamera(
      new T.Vector2(
        ((event.clientX - r.left) / r.width) * 2 - 1,
        (-(event.clientY - r.top) / r.height) * 2 + 1,
      ),
      this.camera,
    );
    return ray.ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -height), new T.Vector3());
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

  private onPointerDown(event: PointerEvent) {
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
    if (!drag || !s || !e) return;
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

  private onPointerEnd(event: PointerEvent) {
    if (!this.drag) return;
    event.stopImmediatePropagation();
    const element = this.renderer.domElement;
    if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
    this.drag = null;
    this.controls.enabled = true;
    element.style.cursor = 'grab';
  }

  /** Capture-phase listeners, so a drag stops the orbit controls from panning. */
  installLayoutDrag() {
    const element: GlobalEventHandlers = this.renderer.domElement;
    element.addEventListener('pointerdown', (event) => this.onPointerDown(event), true);
    element.addEventListener('pointermove', (event) => this.onPointerMove(event), true);
    element.addEventListener('pointerup', (event) => this.onPointerEnd(event), true);
    element.addEventListener('pointercancel', (event) => this.onPointerEnd(event), true);
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

  private placeLabels(w: number, h: number) {
    for (const item of this.labelItems) {
      if (!this.dimensions && !item.armHandle) {
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
