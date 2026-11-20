// The 3D view: it draws a configuration, or a cockpit design on its own, with its camera, and
// keeps the elements over the view in place. What is drawn comes from render-model.ts, which
// three-adapter.ts turns into objects; the renderer, the materials and the surroundings are set
// up in their own modules, overlays.ts places what is drawn over the view, and pointer.ts handles
// the pointer.
import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import type { RoomConfig } from '../room/config.ts';
import type { CockpitEvaluation } from '../room/evaluate.ts';
import type { PartHit } from '../cockpit/cad/interaction/picking.ts';
import type { CockpitDrawing } from '../cockpit/render/cad.ts';
import type { ArmHandle } from '../room/render/desk.ts';
import type { Handle, HandleModifiers } from '../cockpit/cad/interaction/handles.ts';
import type { JointMarker } from '../cockpit/cad/interaction/joint-markers.ts';
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
} from './camera.ts';
import { addEnvironment, placeFloor, rethemeEnvironment, type Environment } from './environment.ts';
import { HoverMark, type Mark } from './hover-mark.ts';
import { SceneOverlays } from './overlays.ts';
import { createPalette } from './palette.ts';
import {
  isPlanView,
  ScenePointer,
  type ArmJoint,
  type PagePoint,
  type PointerHost,
} from './pointer.ts';
import { createRenderer, setVectorBackground } from './renderer.ts';
import { readSceneTheme, type SceneTheme } from './theme.ts';
import { addPrimitives, disposeDrawing, type Palette } from './three-adapter.ts';

/** The scene colors defined by the page's stylesheet. */
const themeOfPage = () =>
  readSceneTheme((token) => getComputedStyle(document.documentElement).getPropertyValue(token));

export class CockpitScene implements PointerHost {
  declare container: HTMLElement;
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
  declare sceneBounds: SceneBounds | null;
  declare root: T.Group | null;
  declare dims: T.Object3D | null;
  declare armHandles: ArmHandle[];
  declare overlays: SceneOverlays;
  declare pointer: ScenePointer;
  declare hoverMark: HoverMark;
  /** Bumped whenever the drawing changes, so the next frame renders again. */
  declare revision: number;
  declare lastSignature: string;
  declare onArmMove: ((joint: ArmJoint, x: number, z: number) => void) | undefined;
  declare onLayoutMove: ((target: string, x: number, z: number) => void) | undefined;
  declare onLayoutSelect: ((target: string) => void) | undefined;
  declare onPartPick: ((hit: PartHit | null) => void) | undefined;
  declare onPartHover: ((hit: PartHit | null, pointer: PagePoint) => void) | undefined;
  /** A click on the marker of a joint, to open its card. */
  declare onJointMarkerPick: ((marker: JointMarker) => void) | undefined;
  declare onHandleGrab: ((handle: Handle) => void) | undefined;
  declare onHandleDrag:
    ((handle: Handle, movedMm: number, modifiers: HandleModifiers) => void) | undefined;
  declare onHandleRelease: ((handle: Handle) => void) | undefined;

  constructor(container: HTMLElement, labels: HTMLElement) {
    this.container = container;
    this.dimensions = true;
    this.view = 'iso';
    this.layoutEditing = false;
    this.layoutTarget = 'desk';
    this.roomEditing = false;
    this.s = null;
    this.e = null;
    this.cockpit = null;
    this.sceneBounds = null;
    this.root = null;
    this.dims = null;
    this.armHandles = [];
    this.lastSignature = '';
    this.onArmMove = undefined;
    this.onLayoutMove = undefined;
    this.onLayoutSelect = undefined;
    this.onPartPick = undefined;
    this.onPartHover = undefined;
    this.onJointMarkerPick = undefined;
    this.onHandleGrab = undefined;
    this.onHandleDrag = undefined;
    this.onHandleRelease = undefined;
    this.overlays = new SceneOverlays(labels);
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
    this.controls = createControls(this.camera, element);
    this.environment = addEnvironment(this.scene, vectorFallback, this.theme);
    this.mat = createPalette(vectorFallback);
    this.hoverMark = new HoverMark(this.scene, this.mat);
    this.revision = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.pointer = new ScenePointer(this, {
      element,
      container,
      camera: this.camera,
      controls: this.controls,
    });
    this.pointer.install();
    this.animate();
  }

  private framing(): Framing | null {
    return this.s && this.e && this.sceneBounds
      ? { state: this.s, evaluation: this.e, bounds: this.sceneBounds }
      : null;
  }

  private viewSize() {
    return { width: this.container.clientWidth, height: this.container.clientHeight };
  }

  resize() {
    const { width, height } = this.viewSize();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.setFrustum();
    this.revision++;
  }

  setFrustum() {
    const { width, height } = this.viewSize();
    if (!width || !height) return;
    const aspect = width / height;
    const size = viewHeight(this.view, aspect, this.framing());
    this.camera.left = (-size * aspect) / 2;
    this.camera.right = (size * aspect) / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
  }

  /** Keeps an element of the page beside a point of the scene, in cm, or lets it go (null). */
  anchorElement(
    el: HTMLElement,
    pointCm: { x: number; y: number; z: number } | null,
    clearOfCm: { x: number; y: number; z: number } | null = null,
  ) {
    this.overlays.anchorBeside(el, pointCm, clearOfCm);
    this.revision++;
  }

  /**
   * Keeps an element of the page above the outline some points of the scene make on screen, or
   * below it when there is no room above, clear of what lies inside; null lets it go.
   */
  anchorAbove(el: HTMLElement, pointsCm: readonly { x: number; y: number; z: number }[] | null) {
    this.overlays.anchorAbove(el, pointsCm);
    this.revision++;
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
      disposeDrawing(this.root, this.mat);
      this.scene.remove(this.root);
    }
    this.overlays.clear();
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
    this.overlays.addLabels(model.labels);
    this.overlays.addJointMarkers(cockpit?.jointMarkers ?? [], (marker) =>
      this.onJointMarkerPick?.(marker),
    );
    this.overlays.addHandles(cockpit?.handles ?? [], (event, handle) =>
      this.pointer.grabHandle(event, handle),
    );
    this.armHandles = model.armHandles;
    this.setFrustum();
    // Handles are placed at once, so a ball is never grabbed where it was before it is drawn.
    this.camera.updateMatrixWorld();
    this.overlays.placeHandles(this.camera, this.viewSize());
    // The parts may have changed: the next move of the pointer marks them again.
    this.pointer.clearHover();
  }

  /** Puts the ground and the grid at the floor of what the scene shows. */
  private placeFloor() {
    placeFloor(this.environment, this.sceneBounds ? floorHeightCm(this.sceneBounds) : 0);
  }

  /** Takes the scene colors from the stylesheet again, after the interface theme changed. */
  applyTheme() {
    const theme = themeOfPage();
    if (JSON.stringify(theme) === JSON.stringify(this.theme)) return;
    this.theme = theme;
    this.scene.background = new T.Color(theme.background);
    setVectorBackground(this.renderer, theme.background);
    this.environment = rethemeEnvironment(this.scene, this.environment, theme);
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
    this.pointer.setPartPicking(on);
  }

  setDimensions(on: boolean) {
    this.revision++;
    this.dimensions = on;
    if (this.dims) this.dims.visible = on;
    this.overlays.showDimensions(on);
  }

  get hoverMarked(): boolean {
    return this.hoverMark.shown;
  }

  markHover(mark: Mark | null) {
    this.hoverMark.show(mark);
    this.revision++;
  }

  /** Renders only when the camera, the size or the drawing changed. */
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.camera.updateMatrixWorld();
    const size = this.viewSize();
    const signature = [
      ...this.camera.matrixWorld.elements,
      ...this.camera.projectionMatrix.elements,
      size.width,
      size.height,
      this.revision,
      this.view,
    ].join(',');
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;
    this.renderer.render(this.scene, this.camera);
    this.overlays.placeAll(this.camera, size, { dimensions: this.dimensions, view: this.view });
  }
}

function createControls(camera: T.Camera, element: HTMLElement | SVGElement): OrbitControls {
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.minZoom = 0.5;
  controls.maxZoom = 4;
  controls.enablePan = true;
  return controls;
}
