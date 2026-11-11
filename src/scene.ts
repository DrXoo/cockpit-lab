import { wallFrame } from './room.ts';
import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { SVGRenderer } from 'three/examples/jsm/renderers/SVGRenderer.js';
import {
  transformPoint,
  inversePoint,
  clamp,
  round,
  clampEdge,
  overlapDepth,
  rigLift,
  floorHeight,
} from './model.ts';
import { sceneBounds, viewHeight, cameraPose } from './scene-camera.ts';
import { createRenderList, ROOT } from './render-list.ts';
import { drawRig } from './render-rig.ts';
import { addPrimitives } from './three-adapter.ts';
const radians = (d) => (d * Math.PI) / 180;
const V = (...[x, y, z]: number[]) => new T.Vector3(x, y, z);
export class CockpitScene {
  // Typed loosely during the JavaScript migration.
  declare armDims: any;
  declare armHandles: any;
  declare camera: any;
  declare container: any;
  declare controls: any;
  declare deskGroup: any;
  declare dimensions: any;
  declare dims: any;
  declare drag: any;
  declare e: any;
  declare group: any;
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
  declare rigGroup: any;
  declare roomEditing: any;
  declare roomGroup: any;
  declare root: any;
  declare s: any;
  declare scene: any;
  declare sceneBounds: any;
  declare sideDims: any;
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
  box(w, h, d, x, y, z, mat = this.mat.silver, parent = this.group, edges = false) {
    const m = new T.Mesh(
      new T.BoxGeometry(Math.max(w, 0.1), Math.max(h, 0.1), Math.max(d, 0.1)),
      mat,
    );
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    if (edges) {
      const line = new T.LineSegments(new T.EdgesGeometry(m.geometry), this.mat.edge);
      m.add(line);
    }
    return m;
  }
  beam(axis, length, x, y, z, profile = '40x40', parent = this.group) {
    const thick = 4,
      deep = profile === '40x80' ? 8 : 4;
    let w = thick,
      h = deep,
      d = length;
    if (axis === 'x') {
      w = length;
      d = thick;
    }
    if (axis === 'y') {
      w = deep;
      h = length;
      d = thick;
    }
    const m = this.box(w, h, d, x, y, z, this.mat.silver, parent, true);
    const groove = this.mat.groove;
    if (axis === 'z') {
      for (const dx of [-1.1, 1.1])
        this.box(0.28, 0.09, length - 0.5, dx, h / 2 + 0.04, 0, groove, m);
      for (const dy of [-h / 4, h / 4])
        this.box(0.09, 0.3, length - 0.5, w / 2 + 0.04, dy, 0, groove, m);
    }
    if (axis === 'x') {
      for (const dz of [-1.1, 1.1])
        this.box(length - 0.5, 0.09, 0.28, 0, h / 2 + 0.04, dz, groove, m);
      for (const dy of [-h / 4, h / 4])
        this.box(length - 0.5, 0.3, 0.09, 0, dy, d / 2 + 0.04, groove, m);
    }
    if (axis === 'y') {
      for (const dx of [-w / 4, w / 4])
        this.box(0.3, length - 0.5, 0.09, dx, 0, d / 2 + 0.04, groove, m);
    }
    return m;
  }
  cylinder(r, len, x, y, z, mat = this.mat.dark, parent = this.group, segments = 16) {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, len, segments), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  sphere(r, x, y, z, mat = this.mat.dark, parent = this.group) {
    const m = new T.Mesh(new T.SphereGeometry(r, 16, 10), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  tube(a, b, r, mat = this.mat.dark, parent = this.group) {
    const va = Array.isArray(a) ? V(...a) : a,
      vb = Array.isArray(b) ? V(...b) : b,
      len = va.distanceTo(vb);
    const mesh = new T.Mesh(new T.CylinderGeometry(r, r, Math.max(0.01, len), 12), mat);
    mesh.position.copy(va).add(vb).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(V(0, 1, 0), vb.clone().sub(va).normalize());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }
  line(points, mat = this.mat.dim, parent = this.dims, dashed = false) {
    const geo = new T.BufferGeometry().setFromPoints(points.map((p) => V(...p)));
    const line = dashed
      ? new T.Line(
          geo,
          new T.LineDashedMaterial({
            color: 0x9ba78d,
            dashSize: 3,
            gapSize: 2,
            transparent: true,
            opacity: 0.7,
          }),
        )
      : new T.Line(geo, mat);
    if (dashed) line.computeLineDistances();
    parent.add(line);
    return line;
  }
  label(text, x, y, z, object = false) {
    const el = document.createElement('div');
    el.className = 'dim-label' + (object ? ' object-label' : '');
    el.textContent = text;
    this.labels.append(el);
    const item: any = { el, position: V(x, y, z), object };
    this.labelItems.push(item);
    return item;
  }
  dimension(a, b, text, offset = [0, 0, 0], parent = this.dims) {
    this.line([a, b], this.mat.dim, parent);
    const along = V(...b)
      .sub(V(...a))
      .normalize();
    const tick = Math.abs(along.x) > 0.5 ? [0, 0, 2.2] : [2.2, 0, 0];
    for (const p of [a, b])
      this.line(
        [
          [p[0] - tick[0], p[1] - 0.1, p[2] - tick[2]],
          [p[0] + tick[0], p[1] + 0.1, p[2] + tick[2]],
        ],
        this.mat.dim,
        parent,
      );
    return this.label(
      text,
      (a[0] + b[0]) / 2 + offset[0],
      (a[1] + b[1]) / 2 + offset[1],
      (a[2] + b[2]) / 2 + offset[2],
    );
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
    this.rigGroup = new T.Group();
    this.root.add(this.rigGroup);
    this.group = this.rigGroup;
    this.dims = new T.Group();
    this.root.add(this.dims);
    this.dims.visible = this.dimensions;
    const w = s.width,
      l = s.length;
    if (s.cockpitEnabled !== false) {
      const rig = createRenderList();
      drawRig(rig, ROOT, s, e, { person: this.person });
      addPrimitives(rig.primitives, this.rigGroup, this.mat);
      this.rigGroup.position.set(s.cockpitX, 0, s.cockpitZ);
      this.rigGroup.rotation.y = radians(s.cockpitAngle);
    }
    this.deskGroup = new T.Group();
    this.root.add(this.deskGroup);
    this.group = this.deskGroup;
    if (s.deskEnabled !== false) this.buildDesk({ ...s, deskZ: 0 }, e);
    this.deskGroup.position.set(s.deskX, 0, s.deskZ);
    this.deskGroup.rotation.y = radians(s.deskAngle);
    this.group = this.root;
    this.armHandles = [];
    this.armDims = null;
    if (s.deskEnabled !== false && s.monitorEnabled !== false) this.buildMonitor(s, e);
    const worldDims = this.dims,
      rigDims = new T.Group();
    worldDims.add(rigDims);
    this.dims = rigDims;
    const startLabels = this.labelItems.length,
      left = -w / 2 - 20;
    if (s.cockpitEnabled !== false) {
      this.dimension([left, 0.8, 0], [left, 0.8, l], `${l} cm`, [-2, 0, 0]);
      this.line([
        [-w / 2, 0.8, 0],
        [left - 4, 0.8, 0],
      ]);
      this.line([
        [-w / 2, 0.8, l],
        [left - 4, 0.8, l],
      ]);
      this.dimension([-w / 2, 0.8, -18], [w / 2, 0.8, -18], `${w} cm`, [0, 0, -3]).notSide = true;
      this.line([
        [-w / 2, 0.8, 0],
        [-w / 2, 0.8, -22],
      ]);
      this.line([
        [w / 2, 0.8, 0],
        [w / 2, 0.8, -22],
      ]);
      this.sideDims = new T.Group();
      rigDims.add(this.sideDims);
      this.sideDims.visible = this.view === 'side';
      this.dimension(
        [left, 0, 5],
        [left, floorHeight(s, 'seatH'), 5],
        `Asiento ${floorHeight(s, 'seatH')} cm`,
        [0, 0, -7],
        this.sideDims,
      ).sideOnly = true;
      if (s.wheel)
        this.dimension(
          [left, 0, l + 18],
          [left, floorHeight(s, 'wheelH'), l + 18],
          `Volante ${floorHeight(s, 'wheelH')} cm`,
          [0, 0, 8],
          this.sideDims,
        ).sideOnly = true;
      this.dimension(
        [w / 2 + 12, 0, l / 2],
        [w / 2 + 12, 10 + rigLift(s), l / 2],
        `Base · eje ${10 + rigLift(s)} cm`,
        [0, 0, 5],
        this.sideDims,
      ).sideOnly = true;
      rigDims.position.set(s.cockpitX, 0, s.cockpitZ);
      rigDims.rotation.y = radians(s.cockpitAngle);
      for (const item of this.labelItems.slice(startLabels)) {
        item.rigLabel = true;
        const p = transformPoint(item.position, e.rigPose);
        item.position.set(p.x, p.y, p.z);
      }
    }
    this.dims = worldDims;
    const deskDims = new T.Group();
    worldDims.add(deskDims);
    const deskLabels = this.labelItems.length;
    if (s.deskEnabled !== false) {
      this.dimension(
        [e.deskRight + 8, 0.8, e.deskBack],
        [e.deskRight + 8, 0.8, e.deskFront],
        `${s.deskWidth} cm`,
        [3, 0, 0],
        deskDims,
      ).notSide = true;
      this.dimension(
        [e.deskLeft, 0.8, e.deskFront + 12],
        [e.deskRight, 0.8, e.deskFront + 12],
        `${s.deskDepth} cm`,
        [0, 0, 3],
        deskDims,
      ).notSide = true;
      this.label('ESCRITORIO', s.deskDepth / 2 - 20, s.deskH + 8, s.deskWidth / 2 - 8, true);
      deskDims.position.set(s.deskX, 0, s.deskZ);
      deskDims.rotation.y = radians(s.deskAngle);
      for (const item of this.labelItems.slice(deskLabels)) {
        const p = transformPoint(item.position, e.deskPose);
        item.position.set(p.x, p.y, p.z);
      }
    }
    if (s.cockpitEnabled !== false && (s.shifter || s.handbrake)) {
      const p = transformPoint(
          { x: e.drivingMount.x, y: floorHeight(s, 'hotasH') + 30, z: e.drivingMount.z },
          e.rigPose,
        ),
        tag = this.label(
          `${s.shifter && s.handbrake ? 'CAMBIO + FRENO' : s.shifter ? 'CAMBIO' : 'FRENO'} · ${s.drivingSide === 'left' ? 'IZQUIERDA' : 'DERECHA'} DEL PILOTO`,
          p.x,
          p.y,
          p.z,
          true,
        );
      tag.topOnly = true;
      tag.offsetY = -32;
    }
    if (s.deskEnabled !== false && s.monitorEnabled !== false && s.monitorMode === 'cockpit')
      this.label(
        `${s.monitorInches}″ · MONITOR COMPARTIDO`,
        e.monitorPoint.x,
        s.monitorH + e.monitorH / 2 + 8,
        e.monitorPoint.z,
        true,
      );
    this.buildRoom(s, e);
    if (this.layoutEditing && ['top', 'desk'].includes(this.view)) {
      const item = e.desktopItems.find((i) => i.id === this.layoutTarget),
        furniture = e.room.furniture.find((i) => 'furniture:' + i.id === this.layoutTarget),
        feature = e.room.features.find((i) => 'feature:' + i.id === this.layoutTarget),
        poly = furniture
          ? furniture.polygon
          : feature
            ? feature.leaf || [feature.a, feature.b]
            : item
              ? item.polygon
              : this.layoutTarget === 'desk'
                ? e.deskPolygon
                : e.rigPolygon,
        y = furniture ? furniture.y1 + 1 : item ? s.deskH + item.height + 1 : 1.5;
      if (poly.length)
        this.line(
          [...poly, poly[0]].map((p) => [p.x, y, p.z]),
          new T.LineBasicMaterial({ color: 0xd96236 }),
          this.root,
        );
      if (item && this.view === 'top')
        this.label(item.label.toUpperCase(), item.world.x, y + 4, item.world.z, true).offsetY = -24;
    }
    this.dims.visible = this.dimensions;
    this.setFrustum();
  }
  buildRoom(s, e) {
    this.roomGroup = new T.Group();
    this.root.add(this.roomGroup);
    this.roomGroup.visible = s.roomEnabled !== false;
    if (s.roomEnabled === false) return;
    const g = this.roomGroup,
      mat = (color, opacity = 1) =>
        new T.MeshBasicMaterial({
          color,
          transparent: opacity < 1,
          opacity,
          side: T.DoubleSide,
          depthWrite: opacity === 1,
        });
    const wallMat = mat('#b9c2ae', s.roomFullWalls ? 0.32 : 0.85),
      doorMat = mat('#b8754f', 0.83),
      windowMat = mat('#92b9bd', 0.42),
      furnMat = new T.MeshStandardMaterial({ color: '#a6af96', roughness: 0.9 }),
      furnEdge = new T.MeshStandardMaterial({ color: '#76866d', roughness: 0.9 });
    const floor = new T.Mesh(new T.PlaneGeometry(s.roomW, s.roomD), mat('#e5e9dd', 0.8));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(s.roomX + s.roomW / 2, 0.08, s.roomZ + s.roomD / 2);
    floor.receiveShadow = true;
    g.add(floor);
    const wallHeight = s.roomFullWalls ? s.roomH : 14;
    for (const wall of ['north', 'east', 'south', 'west']) {
      const f = wallFrame(s, wall),
        items = e.room.features.filter((v) => v.wall === wall).sort((a, b) => a.offset - b.offset);
      const part = (start, end, bottom, top) => {
        if (end - start < 0.05 || top - bottom < 0.05) return;
        const c = (start + end) / 2;
        this.box(
          f.tx ? end - start : 7,
          top - bottom,
          f.tz ? end - start : 7,
          f.x + f.tx * c - f.nx * 3.5,
          (bottom + top) / 2,
          f.z + f.tz * c - f.nz * 3.5,
          wallMat,
          g,
        );
      };
      let end = 0;
      for (const item of items) {
        part(end, item.offset, 0, wallHeight);
        if (item.type === 'window')
          part(item.offset, item.offset + item.width, 0, Math.min(wallHeight, item.sill));
        part(item.offset, item.offset + item.width, item.sill + item.height, wallHeight);
        end = Math.max(end, item.offset + item.width);
      }
      part(end, f.length, 0, wallHeight);
    }
    const corners = [
      [s.roomX, s.roomZ, 'A'],
      [s.roomX + s.roomW, s.roomZ, 'B'],
      [s.roomX + s.roomW, s.roomZ + s.roomD, 'C'],
      [s.roomX, s.roomZ + s.roomD, 'D'],
    ];
    for (const [x, z, name] of corners) this.label(name, x, 1, z, true).topOnly = true;
    this.dimension(
      [s.roomX, 0.9, s.roomZ - 15],
      [s.roomX + s.roomW, 0.9, s.roomZ - 15],
      `HABITACIÓN · ${s.roomW} cm`,
      [0, 0, -5],
    ).topOnly = true;
    this.dimension(
      [s.roomX + s.roomW + 16, 0.9, s.roomZ],
      [s.roomX + s.roomW + 16, 0.9, s.roomZ + s.roomD],
      `${s.roomD} cm`,
      [8, 0, 0],
    ).topOnly = true;
    this.line(
      [
        [-5, 0.7, 0],
        [5, 0.7, 0],
      ],
      this.mat.dim,
      g,
    );
    this.line(
      [
        [0, 0.7, -5],
        [0, 0.7, 5],
      ],
      this.mat.dim,
      g,
    );
    this.label('0,0', 0, 0.8, -8).topOnly = true;
    const fill = (points, color, opacity) => {
      const shape = new T.Shape(points.map((p) => new T.Vector2(p.x, p.z))),
        mesh = new T.Mesh(new T.ShapeGeometry(shape), mat(color, opacity));
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = 0.8;
      g.add(mesh);
    };
    for (const item of e.room.features) {
      const f = item.frame;
      if (item.type === 'door') {
        const blocked = e.room.doorHits.includes(item.id),
          color = blocked ? '#b94f35' : '#cc8850';
        if (item.openAngle > 0) fill([item.hingePoint, ...item.arc], color, 0.16);
        this.line(
          item.arc.map((p) => [p.x, 1.2, p.z]),
          new T.LineBasicMaterial({ color }),
          g,
        );
        this.line(
          [
            [item.a.x, 1.3, item.a.z],
            [item.b.x, 1.3, item.b.z],
          ],
          this.mat.dim,
          g,
        );
        const leaf = this.box(
          item.width,
          Math.min(item.height, s.roomFullWalls ? item.height : 55),
          3.2,
          (item.hingePoint.x + item.tip.x) / 2,
          Math.min(item.height, s.roomFullWalls ? item.height : 55) / 2,
          (item.hingePoint.z + item.tip.z) / 2,
          blocked ? mat('#b94f35', 0.85) : doorMat,
          g,
        );
        leaf.rotation.y = radians(
          (Math.atan2(-(item.tip.z - item.hingePoint.z), item.tip.x - item.hingePoint.x) * 180) /
            Math.PI,
        );
        this.cylinder(2.4, 3, item.hingePoint.x, 1.5, item.hingePoint.z, this.mat.orange, g);
        const label = this.label(
          `${item.name.toUpperCase()} · ${item.openAngle}°${blocked ? ' · BLOQUEADA' : ''}`,
          item.center.x + f.nx * 10,
          2,
          item.center.z + f.nz * 10,
          true,
        );
        label.topOnly = true;
        label.el.classList.add('room-object-label');
      } else if (item.type === 'wardrobeAccess') {
        const occupied = e.room.accessHits.includes(item.id),
          color = occupied ? '#b94f35' : '#7a8c64',
          height = item.height;
        const front = new T.Group();
        front.position.set(item.center.x - f.nx * 1.5, 0, item.center.z - f.nz * 1.5);
        front.rotation.y = Math.atan2(-f.tz, f.tx);
        g.add(front);
        const panel = mat('#c5bea5', 0.9),
          edge = mat('#6b705f');
        for (const side of [-1, 1]) {
          this.box(
            item.width / 2,
            height,
            1,
            (side * item.width) / 4,
            height / 2,
            side * 0.4,
            panel,
            front,
            true,
          );
          this.box(1.5, Math.min(14, height / 3), 1, side * 5, height / 2, 1, edge, front);
        }
        for (const y of [1, height - 1]) this.box(item.width, 2, 2, 0, y, 0, edge, front);
        this.line(
          [
            [item.a.x, 1.4, item.a.z],
            [item.b.x, 1.4, item.b.z],
          ],
          new T.LineBasicMaterial({ color }),
          g,
        );
        if (item.clearance > 0) {
          fill(item.reserve, color, 0.13);
          this.line(
            [...item.reserve, item.reserve[0]].map((p) => [p.x, 1.1, p.z]),
            new T.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }),
            g,
          );
        }
        const status =
          item.clearance <= 0
            ? '! RESERVA DESACTIVADA'
            : occupied
              ? '! REVISAR ACCESO'
              : '✓ ACCESO LIBRE';
        const label = this.label(
          `${item.name.toUpperCase()} · ⇆ ${item.width} × ${item.height} cm · ${status}${item.clearance > 0 ? ` · ${item.clearance} cm delante` : ''}`,
          item.center.x + f.nx * Math.max(8, item.clearance / 2),
          2,
          item.center.z + f.nz * Math.max(8, item.clearance / 2),
          true,
        );
        label.topOnly = true;
        label.el.classList.add('room-object-label');
      } else {
        const window = this.box(
          f.tx ? item.width : 3,
          item.height,
          f.tz ? item.width : 3,
          item.center.x,
          item.sill + item.height / 2,
          item.center.z,
          windowMat,
          g,
        );
        const frameMat = mat('#6f9ca2');
        for (const side of [-1, 1])
          this.box(
            f.tx ? 2 : 5,
            item.height + 4,
            f.tz ? 2 : 5,
            item.center.x + (f.tx * side * item.width) / 2,
            item.sill + item.height / 2,
            item.center.z + (f.tz * side * item.width) / 2,
            frameMat,
            g,
          );
        for (const y of [item.sill, item.sill + item.height])
          this.box(
            f.tx ? item.width + 4 : 5,
            2,
            f.tz ? item.width + 4 : 5,
            item.center.x,
            y,
            item.center.z,
            frameMat,
            g,
          );
        this.line(
          [
            [item.a.x, 1.4, item.a.z],
            [item.b.x, 1.4, item.b.z],
          ],
          new T.LineBasicMaterial({ color: '#538b97' }),
          g,
        );
        if (item.clearance > 0) {
          fill(item.reserve, '#7dabb6', 0.12);
          this.line(
            [...item.reserve, item.reserve[0]].map((p) => [p.x, 1, p.z]),
            new T.LineBasicMaterial({ color: '#7dabb6', transparent: true, opacity: 0.7 }),
            g,
          );
        }
        const label = this.label(
          `${item.name.toUpperCase()} · ${item.width} cm`,
          item.center.x + f.nx * 6,
          2,
          item.center.z + f.nz * 6,
          true,
        );
        label.topOnly = true;
        label.el.classList.add('window-label');
      }
    }
    for (const item of e.room.furniture) {
      const parent = new T.Group();
      parent.position.set(item.x, item.y0, item.z);
      parent.rotation.y = radians(item.angle);
      g.add(parent);
      const W = item.width,
        D = item.depth,
        H = item.height,
        bad = e.room.collisions.includes(item.id),
        material = bad ? new T.MeshStandardMaterial({ color: '#b87b62', roughness: 0.9 }) : furnMat;
      if (item.type === 'chair') {
        const seat = item.seatHeight,
          upholstery = bad ? material : this.mat.fabric,
          radius = Math.min(W, D) * 0.43;
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2,
            x = Math.cos(a) * radius,
            z = Math.sin(a) * radius;
          this.tube([0, 10, 0], [x, 6, z], 1.5, this.mat.arm, parent);
          const wheel = this.cylinder(3, 2.8, x, 3.5, z, this.mat.rubber, parent);
          wheel.rotation.z = Math.PI / 2;
          wheel.rotation.y = a;
        }
        this.cylinder(4.2, 4, 0, 10, 0, this.mat.arm, parent);
        this.cylinder(1.8, seat - 14, 0, (seat + 8) / 2, 0, this.mat.silver, parent);
        this.box(W * 0.72, 7, D * 0.7, 0, seat - 3.5, 0, upholstery, parent, true);
        this.box(
          W * 0.72,
          H - seat,
          5,
          0,
          seat + (H - seat) / 2,
          D * 0.3,
          upholstery,
          parent,
          true,
        );
        this.box(
          W * 0.56,
          Math.min(18, (H - seat) * 0.4),
          1,
          0,
          H - 12,
          D * 0.3 - 3,
          this.mat.seat,
          parent,
        );
        for (const side of [-1, 1]) {
          this.box(2, 18, 2, side * W * 0.43, seat + 6, D * 0.1, this.mat.arm, parent);
          this.box(3, 6, D * 0.55, side * W * 0.43, seat + 18, 0, upholstery, parent);
        }
        this.line(
          [
            [-5, seat + 0.2, -D * 0.22],
            [0, seat + 0.2, -D * 0.34],
            [5, seat + 0.2, -D * 0.22],
          ],
          new T.LineBasicMaterial({ color: '#d1885d' }),
          parent,
        );
        this.line(
          [...item.polygon, item.polygon[0]].map((p) => [p.x, 0.9, p.z]),
          new T.LineBasicMaterial({
            color: bad ? '#b94f35' : '#9caa8c',
            transparent: true,
            opacity: 0.6,
          }),
          g,
        );
        if (item.reserve) {
          fill(item.reserve, '#8c9faa', 0.13);
          this.line(
            [...item.reserve, item.reserve[0]].map((p) => [p.x, 1.2, p.z]),
            new T.LineBasicMaterial({ color: '#879aa5', transparent: true, opacity: 0.8 }),
            g,
          );
          const center = item.reserve.reduce((a, p) => ({ x: a.x + p.x / 4, z: a.z + p.z / 4 }), {
            x: 0,
            z: 0,
          });
          this.label(`RETIRAR SILLA · ${item.pullback} cm`, center.x, 2, center.z, true).topOnly =
            true;
        }
      } else if (item.type === 'wallShelf') {
        const thickness = Math.min(2, H / 2);
        this.box(W, thickness, D, 0, thickness / 2, 0, material, parent, true);
        if (H > 4) {
          for (const x of [-W / 2 + 1, W / 2 - 1])
            this.box(2, H, D, x, H / 2, 0, material, parent, true);
          this.box(W, H, 1.5, 0, H / 2, -D / 2 + 0.75, material, parent);
          const levels = Math.max(1, Math.ceil(H / 35));
          for (let i = 1; i <= levels; i++)
            this.box(
              W,
              thickness,
              D,
              0,
              thickness / 2 + (i * (H - thickness)) / levels,
              0,
              material,
              parent,
              true,
            );
        }
      } else if (item.type === 'shelf') {
        for (const x of [-W / 2 + 1, W / 2 - 1])
          this.box(2, H, D, x, H / 2, 0, material, parent, true);
        this.box(W, H, 1.5, 0, H / 2, D / 2 - 0.75, material, parent);
        const shelves = Math.max(2, Math.ceil(H / 35));
        for (let i = 0; i <= shelves; i++)
          this.box(W, 2, D, 0, 1 + (i * (H - 2)) / shelves, 0, material, parent, true);
        // A few books make the shelf recognizable in 3D without changing its footprint.
        for (let i = 0; i < Math.min(6, Math.floor(W / 10)); i++)
          this.box(4, 20, D * 0.6, -W / 2 + 8 + i * 7, 14, -D * 0.1, furnEdge, parent);
      } else {
        const baseH = item.type === 'bed' ? H * 0.75 : H;
        this.box(W, baseH, D, 0, baseH / 2, 0, material, parent, true);
        if (item.type === 'bed') {
          this.box(W - 4, H * 0.2, D - 4, 0, H * 0.85, 0, this.mat.fabric, parent);
          this.box(W * 0.7, H * 0.05, 25, 0, H * 0.975, -D / 2 + 20, this.mat.wood, parent);
        } else {
          this.box(0.8, H * 0.85, 0.3, 0, H / 2, -D / 2 - 0.2, furnEdge, parent);
          for (const x of [-3, 3]) this.box(1, 8, 1, x, H * 0.53, -D / 2 - 1, furnEdge, parent);
        }
      }
      const label = this.label(
        `${item.name.toUpperCase()} · ${item.width} × ${item.depth}${item.type === 'wallShelf' ? ` · PARED · BASE ${item.elevation} cm` : ''}${bad ? ' · ! INTERFERENCIA' : ''}`,
        item.x,
        item.y1 + 6,
        item.z,
        true,
      );
      label.topOnly = true;
      label.el.classList.add('room-object-label');
    }
    if (e.freeBand) {
      fill(e.freeBand.polygon, '#adc298', 0.18);
      const points = e.freeBand.polygon,
        c = points.reduce((a, p) => ({ x: a.x + p.x / 4, z: a.z + p.z / 4 }), { x: 0, z: 0 });
      this.label(`RESERVA ${s.aisle} cm`, c.x, 1, c.z).topOnly = true;
    }
  }
  buildDesk(s, e) {
    const x = 0,
      z = s.deskZ,
      y = s.deskH,
      b = e.deskBounds;
    this.box(s.deskDepth, 2.5, s.deskWidth, x, y - 1.25, z, this.mat.wood, this.group, true);
    // Subtle plank grain, built from geometry so the viewer is self-contained.
    for (let i = 0; i < Math.floor(s.deskDepth / 5); i++)
      this.box(
        0.06,
        0.04,
        s.deskWidth - 4,
        x - s.deskDepth / 2 + 3 + i * 5,
        y + 0.02,
        z,
        this.mat.wood,
      );
    this.beam('z', b.frameWidth - 10, x + 5, y - 8, z, '40x40');
    for (const zz of [z - b.columnZ, z + b.columnZ]) {
      this.box(66, 4.5, 8, x, 3.5, zz, this.mat.desk);
      this.box(9, y - 15, 8, x + 5, (y - 15) / 2 + 6, zz, this.mat.desk);
      this.box(10, 27, 9, x + 5, y - 25, zz, this.mat.desk);
      this.box(54, 3, 7, x - 4, y - 4, zz, this.mat.desk);
      for (const xx of [x - 27, x + 27]) this.cylinder(2.4, 1.4, xx, 0.8, zz, this.mat.rubber);
    }
    this.buildDesktopObjects(s, e);
  }
  buildDesktopObjects(s, e) {
    const mat = e.desktopItems.find((item) => item.id === 'mat');
    for (const item of [...e.desktopItems].sort(
      (a, b) => (a.id === 'mat' ? -1 : 0) - (b.id === 'mat' ? -1 : 0),
    )) {
      if (item.id === 'arm') continue;
      const g = new T.Group(),
        onMat =
          !!mat && item.id !== 'mat' && overlapDepth(item.localPolygon, mat.localPolygon) > 0.01;
      g.position.set(item.local.x, s.deskH + (onMat ? 0.35 : 0), item.local.z);
      g.rotation.y = radians(item.local.angle);
      this.group.add(g);
      const X = item.sizeX,
        Z = item.sizeZ;
      if (item.id === 'mat') {
        const fabric = new T.MeshStandardMaterial({ color: 0x333c39, roughness: 1 });
        this.box(X, 0.35, Z, 0, 0.2, 0, fabric, g);
        const seam = new T.LineBasicMaterial({ color: 0x8a907b });
        this.line(
          [
            [-X / 2 + 0.6, 0.4, -Z / 2 + 0.6],
            [X / 2 - 0.6, 0.4, -Z / 2 + 0.6],
            [X / 2 - 0.6, 0.4, Z / 2 - 0.6],
            [-X / 2 + 0.6, 0.4, Z / 2 - 0.6],
            [-X / 2 + 0.6, 0.4, -Z / 2 + 0.6],
          ],
          seam,
          g,
        );
        this.box(1.5, 0.08, 5.5, X / 2 - 2, 0.43, Z / 2 - 5, this.mat.orange, g);
      }
      if (item.id === 'keyboard') {
        this.box(X, 1.8, Z, 0, 1.1, 0, this.mat.dark, g, true);
        const rows = 5,
          columns = 12,
          dx = (X - 1.8) / rows,
          dz = (Z - 1.6) / columns;
        for (let row = 0; row < rows; row++)
          for (let col = 0; col < columns; col++)
            this.box(
              dx * 0.78,
              0.55,
              dz * 0.8,
              -X / 2 + 1.1 + row * dx,
              2.2,
              -Z / 2 + 1 + col * dz,
              row === 0 && col === 0 ? this.mat.orange : this.mat.fabric,
              g,
            );
        this.box(dx * 0.8, 0.58, dz * 4, -X / 2 + 1.1, 2.22, 0, this.mat.groove, g);
      }
      if (item.id === 'mouse') {
        const shell = this.sphere(1, 0, 1.65, 0, this.mat.dark, g);
        shell.scale.set(5.8, 1.65, 3.4);
        this.line(
          [
            [-0.2, 3.28, 0],
            [2.4, 3.05, 0],
            [4.4, 2.55, 0],
          ],
          new T.LineBasicMaterial({ color: 0x74816e }),
          g,
        );
        const wheel = this.cylinder(0.65, 1, 1.5, 3.1, 0, this.mat.rubber, g);
        wheel.rotation.x = Math.PI / 2;
        this.box(0.8, 0.25, 1, -0.8, 3.23, 0, this.mat.orange, g);
      }
      if (item.id === 'pc') {
        const H = s.pcHeight;
        this.box(X, H, Z, 0, H / 2, 0, this.mat.dark, g, true);
        this.box(0.3, H * 0.81, Z * 0.83, -X / 2 - 0.2, H * 0.51, 0, this.mat.fabric, g);
        for (let i = 0; i < 10; i++)
          this.box(
            0.15,
            0.25,
            Z * 0.74,
            -X / 2 - 0.4,
            H * 0.12 + i * H * 0.075,
            0,
            this.mat.dark,
            g,
          );
        for (let i = 0; i < 7; i++)
          this.box(X * 0.76, 0.12, 0.25, 0, H + 0.07, -Z * 0.3 + i * Z * 0.1, this.mat.groove, g);
        this.sphere(0.35, X * 0.25, H + 0.2, -Z * 0.35, this.mat.orange, g);
        for (const xx of [-X * 0.35, X * 0.35])
          for (const zz of [-Z * 0.35, Z * 0.35])
            this.cylinder(1, 0.7, xx, 0.35, zz, this.mat.rubber, g);
      }
    }
  }
  buildMonitor(s, e) {
    const p = e.clampPoint,
      target = e.monitorPoint,
      R = s.armReach,
      arm = e.armPose,
      mid = arm.elbow,
      actual = arm.end;
    const anchor = new T.Group(),
      edge = clampEdge(s);
    anchor.position.set(p.x, s.deskH, p.z);
    anchor.rotation.y = radians(s.deskAngle + { xmin: 0, xmax: 180, zmin: -90, zmax: 90 }[edge]);
    this.group.add(anchor);
    if (s.clampMount === 'clamp') {
      this.box(8, 2, 8, 0, 1, 0, this.mat.arm, anchor);
      this.box(2, 8, 6, -6, -3, 0, this.mat.dark, anchor);
      this.box(8, 1.5, 6, -3, -7, 0, this.mat.dark, anchor);
      this.cylinder(0.6, 6, 0, -4, 0, this.mat.silver, anchor);
    } else {
      this.cylinder(3.8, 1.2, 0, 0.6, 0, this.mat.arm, anchor);
      this.cylinder(0.6, 7, 0, -3, 0, this.mat.silver, anchor);
    }
    this.cylinder(
      1.6,
      Math.max(8, target.y - s.deskH),
      p.x,
      (target.y + s.deskH) / 2,
      p.z,
      this.mat.arm,
    );
    this.tube([p.x, target.y, p.z], [mid.x, target.y, mid.z], 1.4, this.mat.arm);
    this.tube([mid.x, target.y, mid.z], [actual.x, target.y, actual.z], 1.3, this.mat.arm);
    for (const j of [{ x: p.x, z: p.z }, mid, actual])
      this.cylinder(2.7, 3, j.x, target.y, j.z, this.mat.dark);
    if (!arm.reachable) {
      const bad = new T.LineDashedMaterial({ color: 0xc26a46, dashSize: 2, gapSize: 2 });
      this.line(
        [
          [actual.x, target.y, actual.z],
          [target.x, target.y, target.z],
        ],
        bad,
        this.group,
        true,
      );
    }
    const monitor = new T.Group();
    monitor.position.set(target.x, target.y, target.z);
    monitor.rotation.y = radians(e.monitorAngle);
    this.group.add(monitor);
    this.box(e.monitorW, e.monitorH, 3.3, 0, 0, 0, this.mat.dark, monitor);
    this.box(e.monitorW - 1.8, e.monitorH - 1.8, 0.1, 0, 0.3, -1.72, this.mat.screen, monitor);
    this.box(4, 0.4, 0.3, 0, -e.monitorH / 2 + 0.5, -1.9, this.mat.silver, monitor);
    this.box(12, 12, 2, 0, 0, 3, this.mat.arm, monitor);
    this.armHandles = [
      { id: 'elbow', label: 'CODO', point: mid },
      { id: 'end', label: 'VESA', point: actual },
    ];
    if (this.layoutEditing && this.layoutTarget === 'arm' && ['top', 'desk'].includes(this.view))
      for (const handle of this.armHandles) {
        this.sphere(3.8, handle.point.x, handle.point.y + 3, handle.point.z, this.mat.orange);
        const item = this.label(
          handle.label,
          handle.point.x,
          handle.point.y + 7,
          handle.point.z,
          true,
        );
        item.el.classList.add('arm-joint-label');
        item.offsetY = -20;
        item.armHandle = true;
      }
    // Horizontal reach indicator projected onto floor in top view.

    this.armDims = new T.Group();
    this.dims.add(this.armDims);
    this.line(
      [
        [p.x, 0.8, p.z],
        [target.x, 0.8, target.z],
      ],
      this.mat.dim,
      this.armDims,
      true,
    );
    const arc = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      arc.push([p.x + Math.cos(a) * R, 0.6, p.z + Math.sin(a) * R]);
    }
    this.line(arc, this.mat.dim, this.armDims, true);
    this.armDims.visible = this.view === 'top';
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
    if (this.roomGroup) this.roomGroup.visible = s.roomEnabled !== false;
    if (this.armDims) this.armDims.visible = view === 'top';
    if (this.sideDims) this.sideDims.visible = view === 'side';
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
