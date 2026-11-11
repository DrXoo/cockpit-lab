import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import { inversePoint, clamp, round } from './model.ts';
import { sceneBounds, viewHeight, cameraPose } from './scene-camera.ts';
import { renderModel } from './render-model.ts';
import { addPrimitives } from './three-adapter.ts';
const V = (...[x, y, z]: number[]) => new T.Vector3(x, y, z);
export class CockpitScene {
  // Typed loosely during the JavaScript migration.
  declare armHandles: any;
  declare camera: any;
  declare container: any;
  declare controls: any;
  declare dimensions: any;
  declare dims: any;
  declare drag: any;
  declare e: any;
  declare labelItems: any;
  declare labels: any;
  declare lastSignature: any;
  declare layoutEditing: any;
  declare layoutTarget: any;
  declare mat: any;
  declare onArmMove: any;
  declare onLayoutMove: any;
  declare onLayoutSelect: any;
  declare person: any;
  declare renderer: any;
  declare resizeObserver: any;
  declare revision: any;
  declare roomEditing: any;
  declare root: any;
  declare s: any;
  declare scene: any;
  declare sceneBounds: any;
  declare vectorFallback: any;
  declare view: any;

  constructor(container, labels) {
    this.container = container;
    this.labels = labels;
    this.dimensions = true;
    this.person = false;
    this.view = 'iso';
    this.labelItems = [];
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#f0f2ec');
    this.camera = new T.OrthographicCamera(-180, 180, 180, -180, 0.1, 2000);
    const canvas = document.createElement('canvas');
    let context;
    try {
      context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    } catch {}
    this.vectorFallback = !context;
    if (context) {
      this.renderer = new T.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = T.PCFShadowMap;
      this.renderer.outputColorSpace = T.SRGBColorSpace;
      this.renderer.toneMapping = T.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1.5;
    } else {
      this.renderer = new SVGRenderer();
      this.renderer.setQuality('high');
      this.renderer.setClearColor('#f0f2ec');
    }
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Vista del proyecto y los elementos añadidos. Usa los botones para cambiar entre 3D y planta; arrastra para girar o distribuir.',
    );
    this.renderer.domElement.tabIndex = 0;
    container.prepend(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.02;
    this.controls.minZoom = 0.5;
    this.controls.maxZoom = 4;
    this.controls.enablePan = true;
    this.scene.add(new T.HemisphereLight(0xffffff, 0xb0b8a2, this.vectorFallback ? 0 : 2.5));
    const sun = new T.DirectionalLight(0xffffff, this.vectorFallback ? 0.65 : 3.2);
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
    this.scene.add(sun);
    this.scene.add(new T.AmbientLight(0xffffff, this.vectorFallback ? 0.7 : 0.3));
    const floor = new T.Mesh(
      new T.PlaneGeometry(1500, 1500),
      this.vectorFallback
        ? new T.MeshBasicMaterial({ color: '#f0f2ec' })
        : new T.MeshStandardMaterial({ color: '#f0f2ec', roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.25;
    floor.receiveShadow = true;
    if (!this.vectorFallback) this.scene.add(floor);
    const grid = new T.GridHelper(800, 80, 0xdde2d4, 0xe3e7dc);
    grid.position.set(0, 0, 50);
    grid.material.transparent = true;
    grid.material.opacity = 0.65;
    grid.renderOrder = -1;
    this.scene.add(grid);
    this.mat = {
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
      green: new T.MeshBasicMaterial({
        color: 0xbac8a5,
        transparent: true,
        opacity: 0.13,
        depthWrite: false,
      }),
      dim: new T.LineBasicMaterial({ color: 0x9ba78d, transparent: true, opacity: 0.85 }),
      arm: new T.MeshStandardMaterial({ color: 0x4f5951, metalness: 0.6, roughness: 0.4 }),
      screen: new T.MeshBasicMaterial({ map: this.screenTexture() }),
    };
    if (this.vectorFallback) this.mat.screen.color.set('#253d33');
    this.revision = 0;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.installLayoutDrag();
    this.animate();
  }
  screenTexture() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 440;
    const ctx = c.getContext('2d');
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
  resize() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.setFrustum();
    this.revision++;
  }
  setFrustum() {
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
    if (!w || !h) return;
    const aspect = w / h;
    const framing = this.s ? { state: this.s, evaluation: this.e, bounds: this.sceneBounds } : null;
    const size = viewHeight(this.view, aspect, framing);
    this.camera.left = (-size * aspect) / 2;
    this.camera.right = (size * aspect) / 2;
    this.camera.top = size / 2;
    this.camera.bottom = -size / 2;
    this.camera.updateProjectionMatrix();
  }
  addLabels(labels) {
    for (const label of labels) {
      const el = document.createElement('div');
      el.className = 'dim-label' + (label.object ? ' object-label' : '');
      if (label.className) el.classList.add(label.className);
      el.textContent = label.text;
      this.labels.append(el);
      const { x, y, z } = label.position;
      this.labelItems.push({ ...label, el, position: V(x, y, z) });
    }
  }
  update(s, e) {
    this.revision++;
    this.s = s;
    this.e = e;
    this.sceneBounds = sceneBounds(s, e);
    if (this.root) {
      this.root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.isMesh && o.material && !Object.values(this.mat).includes(o.material))
          o.material.dispose();
        if (o.isLine && o.material !== this.mat.edge && o.material !== this.mat.dim)
          o.material.dispose();
      });
      this.scene.remove(this.root);
    }
    this.labels.innerHTML = '';
    this.labelItems = [];
    this.root = new T.Group();
    this.scene.add(this.root);
    const model = renderModel(s, e, {
      view: this.view,
      person: this.person,
      layoutEditing: !!this.layoutEditing,
      layoutTarget: this.layoutTarget ?? 'cockpit',
    });
    this.dims = addPrimitives(model.primitives, this.root, this.mat).dimensions;
    this.dims.visible = this.dimensions;
    this.addLabels(model.labels);
    this.armHandles = model.armHandles;
    this.setFrustum();
  }
  setView(view) {
    this.view = view;
    const s = this.s;
    const pose = cameraPose(view, { state: s, evaluation: this.e, bounds: this.sceneBounds });
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
    if (this.s) this.update(this.s, this.e);
  }
  setLayoutEditing(on, target = 'cockpit', roomEditing = false) {
    this.roomEditing = roomEditing;
    this.layoutEditing = on;
    this.layoutTarget = target;
    this.renderer.domElement.style.cursor = on && ['top', 'desk'].includes(this.view) ? 'grab' : '';
    if (this.s) this.update(this.s, this.e);
  }
  installLayoutDrag() {
    const element = this.renderer.domElement,
      ray = new T.Raycaster();
    const point = (event, height = 0) => {
      const r = element.getBoundingClientRect();
      ray.setFromCamera(
        new T.Vector2(
          ((event.clientX - r.left) / r.width) * 2 - 1,
          (-(event.clientY - r.top) / r.height) * 2 + 1,
        ),
        this.camera,
      );
      return ray.ray.intersectPlane(new T.Plane(V(0, 1, 0), -height), new T.Vector3());
    };
    element.addEventListener(
      'pointerdown',
      (event) => {
        if (!this.layoutEditing || !['top', 'desk'].includes(this.view) || event.button !== 0)
          return;
        const floor = point(event),
          top = point(event, this.s.deskH);
        if (!floor || !top) return;
        if (
          this.layoutTarget === 'arm' &&
          this.s.deskEnabled !== false &&
          this.s.monitorEnabled !== false
        ) {
          const r = element.getBoundingClientRect(),
            hits = (this.armHandles ?? [])
              .map((handle) => {
                const q = V(handle.point.x, handle.point.y + 3, handle.point.z).project(
                  this.camera,
                );
                return {
                  ...handle,
                  distance: Math.min(
                    ...[0, -20].map((offset) =>
                      Math.hypot(
                        event.clientX - (r.left + (q.x * 0.5 + 0.5) * r.width),
                        event.clientY - (r.top + (-q.y * 0.5 + 0.5) * r.height + offset),
                      ),
                    ),
                  ),
                };
              })
              .sort((a, b) => a.distance - b.distance);
          const handle = hits.find((h) => h.distance <= 20);
          if (handle) {
            event.preventDefault();
            event.stopImmediatePropagation();
            this.controls.enabled = false;
            this.drag = { pointer: event.pointerId, armJoint: handle.id };
            element.setPointerCapture(event.pointerId);
            element.style.cursor = 'grabbing';
            return;
          }
        }
        if (this.roomEditing) {
          const distance = (p, a, b) => {
            const dx = b.x - a.x,
              dz = b.z - a.z,
              t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
            return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
          };
          const candidates = [
            ...this.e.room.furniture.map((i) => ({
              id: 'furniture:' + i.id,
              item: i,
              furniture: true,
            })),
            ...this.e.room.features.map((i) => ({
              id: 'feature:' + i.id,
              item: i,
              furniture: false,
            })),
          ].sort((a, b) => (a.id === this.layoutTarget ? -1 : b.id === this.layoutTarget ? 1 : 0));
          for (const candidate of candidates) {
            const item = candidate.item,
              local = candidate.furniture
                ? inversePoint(floor, { x: item.x, z: item.z, angle: item.angle })
                : null,
              hit = candidate.furniture
                ? Math.abs(local.x) <= item.width / 2 && Math.abs(local.z) <= item.depth / 2
                : distance(floor, item.a, item.b) < 8 ||
                  (item.type === 'door' && distance(floor, item.hingePoint, item.tip) < 6);
            if (!hit) continue;
            event.preventDefault();
            event.stopImmediatePropagation();
            this.controls.enabled = false;
            this.layoutTarget = candidate.id;
            this.onLayoutSelect?.(candidate.id);
            const center = candidate.furniture ? item : item.center;
            this.drag = {
              pointer: event.pointerId,
              target: candidate.id,
              start: { x: floor.x, z: floor.z },
              x: center.x,
              z: center.z,
              desktop: false,
            };
            element.setPointerCapture(event.pointerId);
            element.style.cursor = 'grabbing';
            return;
          }
        }
        const deskLocal = inversePoint(top, this.e.deskPose),
          ids = this.roomEditing ? [] : this.e.desktopItems.map((item) => item.id),
          order = [
            ...new Set([
              ...(this.roomEditing
                ? []
                : [...this.e.desktopItems]
                    .sort(
                      (a, b) =>
                        b.height - a.height ||
                        (a.id === this.layoutTarget ? -1 : b.id === this.layoutTarget ? 1 : 0),
                    )
                    .map((item) => item.id)),
              ...(this.layoutTarget === 'cockpit' ? ['cockpit'] : []),
              'desk',
              'cockpit',
            ]),
          ];
        let target, start, x, z;
        for (const id of order) {
          if (
            (id === 'desk' && this.s.deskEnabled === false) ||
            (id === 'cockpit' && this.s.cockpitEnabled === false) ||
            (id === 'arm' && this.s.monitorEnabled === false)
          )
            continue;
          const item = this.roomEditing ? null : this.e.desktopItems.find((i) => i.id === id);
          if (item) {
            const local = inversePoint(deskLocal, item.local);
            if (
              Math.abs(local.x) <= item.sizeX / 2 + 1 &&
              Math.abs(local.z) <= item.sizeZ / 2 + 1
            ) {
              target = id;
              start = deskLocal;
              x = item.local.x;
              z = item.local.z;
              break;
            }
          } else if (id === 'desk' || id === 'cockpit') {
            const local = inversePoint(floor, id === 'desk' ? this.e.deskPose : this.e.rigPose),
              hit =
                id === 'desk'
                  ? Math.abs(local.x) <= this.e.deskBounds.halfX &&
                    Math.abs(local.z) <= this.e.deskBounds.halfZ
                  : local.x >= this.e.rigLeft &&
                    local.x <= this.e.rigRight &&
                    local.z >= this.e.lowerZ &&
                    local.z <= this.e.upperZ;
            if (hit) {
              target = id;
              start = floor;
              x = id === 'desk' ? this.s.deskX : this.s.cockpitX;
              z = id === 'desk' ? this.s.deskZ : this.s.cockpitZ;
              break;
            }
          }
        }
        if (!target) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        this.controls.enabled = false;
        this.layoutTarget = target;
        this.onLayoutSelect?.(target);
        this.drag = {
          pointer: event.pointerId,
          target,
          start: { x: start.x, z: start.z },
          x,
          z,
          desktop: ids.includes(target),
        };
        element.setPointerCapture(event.pointerId);
        element.style.cursor = 'grabbing';
      },
      true,
    );
    element.addEventListener(
      'pointermove',
      (event) => {
        if (!this.drag) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.drag.armJoint) {
          const p = point(event, this.s.monitorH + 3);
          if (p) this.onArmMove?.(this.drag.armJoint, p.x, p.z);
          return;
        }
        let p: any = point(event, this.drag.desktop ? this.s.deskH : 0);
        if (p && this.drag.desktop) p = inversePoint(p, this.e.deskPose);
        if (p)
          this.onLayoutMove?.(
            this.drag.target,
            round(this.drag.x + p.x - this.drag.start.x),
            round(this.drag.z + p.z - this.drag.start.z),
          );
      },
      true,
    );
    const end = (event) => {
      if (!this.drag) return;
      event.stopImmediatePropagation();
      if (element.hasPointerCapture(event.pointerId))
        element.releasePointerCapture(event.pointerId);
      this.drag = null;
      this.controls.enabled = true;
      element.style.cursor = 'grab';
    };
    element.addEventListener('pointerup', end, true);
    element.addEventListener('pointercancel', end, true);
  }
  setDimensions(on) {
    this.revision++;
    this.dimensions = on;
    if (this.dims) this.dims.visible = on;
    for (const item of this.labelItems) item.el.hidden = !on;
  }
  setPerson(on) {
    this.person = on;
    this.update(this.s, this.e);
  }
  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.camera.updateMatrixWorld();
    const w = this.container.clientWidth,
      h = this.container.clientHeight;
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
    for (const item of this.labelItems) {
      if (!this.dimensions && !item.armHandle) {
        item.el.hidden = true;
        continue;
      }
      const p = item.position.clone().project(this.camera);
      item.el.hidden =
        p.z < -1 ||
        p.z > 1 ||
        Math.abs(p.x) > 1.04 ||
        Math.abs(p.y) > 1.04 ||
        (this.view === 'side' && (item.object || item.notSide)) ||
        (this.view === 'desk' && item.rigLabel) ||
        (item.topOnly && this.view !== 'top') ||
        (item.sideOnly && this.view !== 'side') ||
        (item.armHandle && !['top', 'desk'].includes(this.view));
      item.el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      item.el.style.top = `${(-p.y * 0.5 + 0.5) * h + (item.offsetY || 0)}px`;
    }
  }
}
