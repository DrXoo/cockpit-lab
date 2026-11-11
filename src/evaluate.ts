// Evaluates a configuration: envelopes, interferences and ergonomic and room checks.
import {
  degToRad,
  inversePoint,
  overlapDepth,
  polygonDistance,
  rectangle,
  round,
  transformPoint,
  type PlanPoint,
  type Placement,
} from './geometry.ts';
import { evaluateRoom, type Obstacle } from './room.ts';
import type { Check, CheckLevel } from './checks.ts';
import type { CockpitConfig } from './config.ts';
import { anatomy } from './anatomy.ts';
import { deskBounds, getDesktopItems } from './desk.ts';
import { pose } from './layout.ts';
import { monitorGeometry } from './monitor-arm.ts';
import { getParts } from './parts.ts';
import { baseSupports, drivingMount, floorHeight, rigLift } from './rig.ts';

export function evaluate(s: CockpitConfig) {
  const hasRig = s.cockpitEnabled !== false,
    hasDesk = s.deskEnabled !== false,
    hasMonitor = hasDesk && s.monitorEnabled !== false;
  const body = anatomy(s),
    hasDriving = hasRig && (s.shifter || s.handbrake),
    driving = drivingMount(s),
    rigPose = pose(s, 'cockpit'),
    deskPose = pose(s, 'desk');
  const flightExtra = s.hotas ? s.hotasOut + 9 : 0,
    drivingExtra = hasDriving ? s.hotasOut + 10 : 0;
  const rigLeft = -s.width / 2 - Math.max(flightExtra, driving.sign < 0 ? drivingExtra : 0),
    rigRight = s.width / 2 + Math.max(flightExtra, driving.sign > 0 ? drivingExtra : 0);
  const bounds = deskBounds(s),
    deskLeft = -bounds.halfX,
    deskRight = bounds.halfX,
    deskBack = -bounds.halfZ,
    deskFront = bounds.halfZ;
  const monitorW = (s.monitorInches * 2.54 * 21) / Math.hypot(21, 9),
    monitorH = (s.monitorInches * 2.54 * 9) / Math.hypot(21, 9);
  const monitor = monitorGeometry(s),
    clampPoint = monitor.anchor,
    monitorPoint = monitor.point,
    monitorAngle = monitor.angle,
    armPose = monitor.arm;
  const reach = Math.hypot(clampPoint.x - monitorPoint.x, clampPoint.z - monitorPoint.z),
    lift = s.monitorH - s.deskH;
  const pedalEnd = s.pedalZ + 18 * Math.cos(degToRad(s.pedalTilt)),
    overhang = pedalEnd > s.length;
  const seatBackZ =
    s.seatZ - 12 - Math.sin(degToRad(s.recline)) * 64 - Math.cos(degToRad(s.recline)) * 4.5;
  const lowerZ = Math.min(0, seatBackZ),
    upperZ = Math.max(s.length, pedalEnd, s.wheel ? s.wheelZ + 32 : 0);
  const rigPolygon = hasRig ? rectangle(rigLeft, rigRight, lowerZ, upperZ, rigPose) : [],
    deskPolygon = hasDesk
      ? rectangle(-bounds.footprintHalfX, bounds.footprintHalfX, deskBack, deskFront, deskPose)
      : [],
    tabletopPolygon = hasDesk ? rectangle(deskLeft, deskRight, deskBack, deskFront, deskPose) : [],
    monitorPolygon = hasMonitor
      ? rectangle(-monitorW / 2, monitorW / 2, -2, 2, { ...monitorPoint, angle: monitorAngle })
      : [];
  const desktopItems = getDesktopItems(s);
  const setupPoints = [
    ...rigPolygon,
    ...deskPolygon,
    ...monitorPolygon,
    ...desktopItems.flatMap((item) => item.polygon),
    ...(hasMonitor ? [armPose.elbow, armPose.end] : []),
  ];
  const allPoints = setupPoints.length ? setupPoints : [{ x: s.roomX, z: s.roomZ }],
    allLeft = Math.min(...allPoints.map((p) => p.x)),
    allRight = Math.max(...allPoints.map((p) => p.x)),
    allBack = Math.min(...allPoints.map((p) => p.z)),
    allFront = Math.max(...allPoints.map((p) => p.z));
  const spaceW = allRight - allLeft,
    spaceD = allFront - allBack,
    freeW = s.roomW - spaceW,
    freeD = s.roomD - spaceD;
  const roomBounds = {
    left: s.roomX,
    right: s.roomX + s.roomW,
    back: s.roomZ,
    front: s.roomZ + s.roomD,
  };
  const clearances = {
    left: allLeft - roomBounds.left,
    right: roomBounds.right - allRight,
    back: allBack - roomBounds.back,
    front: roomBounds.front - allFront,
  };
  const roomFits = Object.values(clearances).every((gap) => gap >= -0.01);
  const sideGap = hasRig && hasDesk ? polygonDistance(rigPolygon, deskPolygon) : 0;
  const solid = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    y0: number,
    y1: number,
    placement: Placement,
  ) => ({
    polygon: rectangle(x0, x1, z0, z1, placement),
    y0,
    y1,
  });
  const rigSolids = hasRig
    ? [
        solid(-s.width / 2, s.width / 2, 0, s.length, 6, 14, rigPose),
        solid(-25, 25, seatBackZ, s.seatZ + 25, s.seatH - 8, s.seatH + 64, rigPose),
        solid(
          -s.width / 2 + 4,
          s.width / 2 - 4,
          s.pedalZ - 19,
          s.pedalZ + 19,
          s.pedalH - 5,
          s.pedalH + 24,
          rigPose,
        ),
      ]
    : [];
  if (hasRig && s.wheel) {
    rigSolids.push(
      solid(-16, 16, s.wheelZ - 3, s.wheelZ + 32, s.wheelH - 10, s.wheelH + 16, rigPose),
    );
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 - 2);
      rigSolids.push(solid(x - 4, x + 4, s.wheelZ + 15, s.wheelZ + 21, 14, s.wheelH - 8, rigPose));
    }
  }
  if (hasRig && s.hotas)
    for (const sign of [-1, 1]) {
      const x = sign * (s.width / 2 + s.hotasOut),
        z = s.hotasZ + (sign === driving.sign && hasDriving ? 24 : 0);
      rigSolids.push(solid(x - 9, x + 9, z - 12.5, z + 12.5, s.hotasH - 4, s.hotasH + 22, rigPose));
    }
  if (hasDriving) {
    const { x, z } = driving;
    rigSolids.push(solid(x - 10, x + 10, z - 15, z + 15, s.hotasH - 4, s.hotasH + 25, rigPose));
  }
  if (hasRig && s.centerStick)
    rigSolids.push(
      solid(-9, 9, s.stickZ - 10, s.stickZ + 10, s.stickH - 3, s.stickH + 22, rigPose),
    );
  for (const volume of rigSolids) {
    volume.y0 += rigLift(s);
    volume.y1 += rigLift(s);
  }
  for (const p of baseSupports(s))
    rigSolids.push(
      solid(p.x - 2, p.x + 2, p.z - 2, p.z + 2, p.y - p.length / 2, p.y + p.length / 2, rigPose),
    );
  const deskSolids = hasDesk
    ? [solid(deskLeft, deskRight, deskBack, deskFront, s.deskH - 2.5, s.deskH, deskPose)]
    : [];
  for (const z of hasDesk ? [-bounds.columnZ, bounds.columnZ] : []) {
    deskSolids.push(solid(0, 10, z - 4.5, z + 4.5, 6, s.deskH - 4, deskPose));
    deskSolids.push(solid(-33, 33, z - 4, z + 4, 1, 6, deskPose));
  }
  let collisionCount = 0;
  for (const r of rigSolids)
    for (const d of deskSolids)
      if (
        Math.min(r.y1, d.y1) - Math.max(r.y0, d.y0) > 0.1 &&
        overlapDepth(r.polygon, d.polygon) > 0.1
      )
        collisionCount++;
  const deskCollision = collisionCount > 0;
  const bodyCheck: Check[] = [];
  const check = (
    id: string,
    label: string,
    value: string,
    level: CheckLevel,
    detail: string,
  ): Check => ({ id, label, value, level, detail });
  bodyCheck.push(
    check(
      'knee',
      'Ángulo de rodilla',
      body.legs.reachable ? `${Math.round(body.legs.angle)}°` : 'Sin alcance',
      !body.legs.reachable
        ? 'error'
        : body.legs.angle < 100 || body.legs.angle > 145
          ? 'warning'
          : 'ok',
      'Guía 100–145° · proporciones medias',
    ),
  );
  bodyCheck.push(
    check(
      'hip',
      'Apertura de cadera',
      `${Math.round(body.hipAngle)}°`,
      body.hipAngle < 85 || body.hipAngle > 125 ? 'warning' : 'ok',
      'Guía 85–125° · respaldo incluido',
    ),
  );
  if (s.wheel)
    bodyCheck.push(
      check(
        'elbow',
        'Ángulo de codo',
        body.arms.reachable ? `${Math.round(body.arms.angle)}°` : 'Sin alcance',
        !body.arms.reachable
          ? 'error'
          : body.arms.angle < 85 || body.arms.angle > 140
            ? 'warning'
            : 'ok',
        'Guía 85–140° · agarre lateral',
      ),
    );
  if (s.hotas) {
    const d = Math.hypot(
      s.hotasZ - body.shoulder.z,
      s.hotasH + 18 - body.shoulder.y,
      s.width / 2 + s.hotasOut - 18,
    );
    bodyCheck.push(
      check(
        'hotas',
        'Alcance HOTAS',
        `${Math.round(d)} cm`,
        d > s.height * 0.332 ? 'error' : d > s.height * 0.3 ? 'warning' : 'ok',
        'Hombro a empuñadura · aproximado',
      ),
    );
  }
  if (s.centerStick) {
    const d = Math.hypot(s.stickZ - body.shoulder.z, s.stickH + 14 - body.shoulder.y);
    bodyCheck.push(
      check(
        'stick',
        'Joystick central',
        `${Math.round(d)} cm`,
        d > s.height * 0.332 ? 'error' : 'ok',
        'Hombro a empuñadura · aproximado',
      ),
    );
  }
  if (hasRig && hasMonitor && s.monitorMode === 'cockpit') {
    const eye = transformPoint({ x: 0, ...body.eye, y: body.eye.y + rigLift(s) }, rigPose),
      d = Math.hypot(monitorPoint.x - eye.x, monitorPoint.z - eye.z, monitorPoint.y - eye.y);
    bodyCheck.push(
      check(
        'eyes',
        'Ojos a pantalla',
        `${Math.round(d)} cm`,
        d < 50 || d > 110 ? 'warning' : 'ok',
        'Distancia geométrica · guía 50–110 cm',
      ),
    );
  }
  const spaceCheck = [
    check(
      'side',
      'Separación en planta',
      sideGap < 0 ? `${Math.ceil(-sideGap)} cm de solape` : `${Math.round(sideGap)} cm`,
      sideGap < 5 ? 'warning' : 'ok',
      sideGap < 0
        ? 'Huellas superpuestas; comprueba las alturas'
        : 'Distancia mínima entre huellas giradas',
    ),
  ];
  spaceCheck.push(
    check(
      'collision',
      'Interferencias',
      deskCollision ? `${collisionCount} cruce${collisionCount > 1 ? 's' : ''}` : 'Sin cruce',
      deskCollision ? 'error' : 'ok',
      'Volúmenes aproximados · giro incluido',
    ),
  );

  {
    spaceCheck.push(
      check(
        'arm',
        'Brazo de monitor',
        armPose.reachable ? (s.monitorMode === 'manual' ? 'Manual' : 'Alcanza') : 'No alcanza',
        !armPose.reachable ? 'error' : reach > s.armReach * 0.9 ? 'warning' : 'ok',
        `${Math.round(reach)} cm en planta · rango ${round(armPose.minReach)}–${s.armReach} cm; tramos ${round(armPose.first)} + ${round(armPose.second)} cm`,
      ),
    );
    spaceCheck.push(
      check(
        'lift',
        'Altura del brazo',
        `${Math.round(lift)} cm`,
        lift < s.armMinH || lift > s.armMaxH ? 'error' : 'ok',
        `Centro VESA sobre tablero · ${s.armMinH}–${s.armMaxH} cm`,
      ),
    );
    if (s.monitorMode === 'cockpit') {
      const monitorClearance = s.monitorH - monitorH / 2 - (floorHeight(s, 'wheelH') + 16);
      spaceCheck.push(
        check(
          'screen',
          'Pantalla / volante',
          s.wheel ? `${Math.round(monitorClearance)} cm` : 'Libre',
          s.wheel && monitorClearance < 2 ? 'warning' : 'ok',
          'Separación vertical de envolventes',
        ),
      );
    }
  }
  if (s.monitorMode === 'vr' && hasMonitor)
    spaceCheck.push(
      check('vr', 'Modo VR', 'Frontal libre', 'ok', 'Monitor aparcado sobre la mesa'),
    );
  const outsideItems = desktopItems.filter((item) => item.outside),
    hardItems = desktopItems.filter((item) => item.id !== 'mat'),
    desktopOverlaps: string[] = [];
  for (let i = 0; i < hardItems.length; i++)
    for (let j = i + 1; j < hardItems.length; j++)
      if (overlapDepth(hardItems[i].localPolygon, hardItems[j].localPolygon) > 0.2)
        desktopOverlaps.push(`${hardItems[i].label} / ${hardItems[j].label}`);
  const mat = desktopItems.find((item) => item.id === 'mat'),
    mouse = desktopItems.find((item) => item.id === 'mouse'),
    mouseOnMat =
      !!mat &&
      !!mouse &&
      mouse.localPolygon.every((p) => {
        const local = inversePoint(p, mat.local);
        return (
          Math.abs(local.x) <= mat.sizeX / 2 + 0.01 && Math.abs(local.z) <= mat.sizeZ / 2 + 0.01
        );
      });
  const desktopChecks = [
    check(
      'desktop-fit',
      'Dentro del tablero',
      outsideItems.length ? 'Revisar bordes' : 'Todo dentro',
      outsideItems.length ? 'warning' : 'ok',
      outsideItems.length
        ? outsideItems.map((i) => i.label).join(', ')
        : `Envolventes y giros sobre ${s.deskWidth} × ${s.deskDepth} cm`,
    ),
    check(
      'desktop-overlap',
      'Objetos sobre la mesa',
      desktopOverlaps.length
        ? `${desktopOverlaps.length} solape${desktopOverlaps.length > 1 ? 's' : ''}`
        : 'Sin solapes',
      desktopOverlaps.length ? 'warning' : 'ok',
      desktopOverlaps.length ? desktopOverlaps.join(' · ') : 'La alfombrilla admite objetos encima',
    ),
    check(
      'mouse-mat',
      'Ratón y alfombrilla',
      mouseOnMat ? 'Dentro' : 'Fuera',
      mouseOnMat ? 'ok' : 'warning',
      `${s.matWidth} × ${s.matDepth} cm · cobertura del ratón`,
    ),
  ];
  const edgeDistance = Math.min(
    Math.abs(s.clampX + bounds.anchorX),
    Math.abs(s.clampX - bounds.anchorX),
    Math.abs(s.clampZ + bounds.anchorZ),
    Math.abs(s.clampZ - bounds.anchorZ),
  );
  desktopChecks.push(
    check(
      'mount',
      'Fijación del brazo',
      s.clampMount === 'grommet' ? 'Pasante' : edgeDistance < 0.1 ? 'En borde' : 'Revisar',
      s.clampMount === 'clamp' && edgeDistance >= 0.1 ? 'warning' : 'ok',
      s.clampMount === 'grommet'
        ? 'Requiere taladro o pasacables compatible'
        : 'Mordaza al borde · compatibilidad por comprobar',
    ),
  );

  const segmentSolid = (a: PlanPoint, b: PlanPoint, r: number, y: number) => {
    const length = Math.hypot(b.x - a.x, b.z - a.z),
      angle = (Math.atan2(-(b.z - a.z), b.x - a.x) * 180) / Math.PI;
    return solid(-length / 2, length / 2, -r, r, y - 3, y + 3, {
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      angle,
    });
  };
  const roomSolids: Obstacle[] = [
    ...rigSolids.map((v) => ({ ...v, label: 'Cockpit' })),
    ...deskSolids.map((v) => ({ ...v, label: 'Escritorio' })),
    ...desktopItems
      .filter((v) => v.id !== 'mat')
      .map((v) => ({ polygon: v.polygon, y0: s.deskH, y1: s.deskH + v.height, label: v.label })),
    ...(hasMonitor
      ? [
          {
            polygon: monitorPolygon,
            y0: s.monitorH - monitorH / 2,
            y1: s.monitorH + monitorH / 2,
            label: 'Monitor',
          },
          ...[
            [clampPoint, armPose.elbow],
            [armPose.elbow, armPose.end],
          ].map(([a, b]) => ({
            ...segmentSolid(a, b, 1.5, s.monitorH),
            label: 'Brazo de monitor',
          })),
        ]
      : []),
  ];
  const room = evaluateRoom(s, roomSolids),
    bandCandidates = (setupPoints.length ? Object.entries(clearances) : [])
      .filter(([, gap]) => gap >= s.aisle)
      .map(([side]) => ({
        side,
        polygon:
          side === 'left'
            ? rectangle(allLeft - s.aisle, allLeft, allBack, allFront, { x: 0, z: 0, angle: 0 })
            : side === 'right'
              ? rectangle(allRight, allRight + s.aisle, allBack, allFront, { x: 0, z: 0, angle: 0 })
              : side === 'back'
                ? rectangle(allLeft, allRight, allBack - s.aisle, allBack, { x: 0, z: 0, angle: 0 })
                : rectangle(allLeft, allRight, allFront, allFront + s.aisle, {
                    x: 0,
                    z: 0,
                    angle: 0,
                  }),
      }));
  const freeBand = bandCandidates.find(
    (b) =>
      !room.furniture.some((f) => overlapDepth(b.polygon, f.polygon) > 0.1) &&
      !room.features
        .filter((f) => f.type === 'door')
        .some((f) => f.sectors.some((p) => overlapDepth(b.polygon, p) > 0.1)),
  );
  const aisleFits = roomFits && !!freeBand;
  const extra: Check[] = [];
  if (hasRig && overhang)
    extra.push(
      check(
        'overhang',
        'Pedalera',
        `Sobresale ${Math.ceil(pedalEnd - s.length)} cm`,
        'error',
        'Alarga el chasis o retrasa la pedalera',
      ),
    );
  if (hasRig && seatBackZ < 0)
    extra.push(
      check(
        'seatback',
        'Respaldo',
        `Sobresale ${Math.ceil(-seatBackZ)} cm`,
        'warning',
        'La huella del conjunto incluye este saliente',
      ),
    );
  if (setupPoints.length && s.roomEnabled !== false && !roomFits)
    extra.push(
      check(
        'room',
        'Zona disponible',
        'Fuera de zona',
        'error',
        'Mueve los elementos o ajusta el origen y tamaño de la zona',
      ),
    );
  else if (setupPoints.length && s.roomEnabled !== false)
    extra.push(
      check(
        'room',
        'Reserva lateral',
        aisleFits ? `${s.aisle} cm posibles` : 'Insuficiente',
        aisleFits ? 'ok' : 'warning',
        'Banda sin muebles ni barrido de puerta; no verifica una ruta de acceso',
      ),
    );
  if (hasRig && s.centerStick && s.wheel && Math.abs(s.stickZ - s.wheelZ) < 24)
    extra.push(
      check(
        'mode',
        'Mandos centrales',
        'Revisar montaje',
        'warning',
        'El joystick y volante comparten zona: desmontaje alterno',
      ),
    );
  if (!hasRig) bodyCheck.length = 0;
  for (let i = spaceCheck.length - 1; i >= 0; i--) {
    const id = spaceCheck[i].id;
    if (
      (['side', 'collision'].includes(id) && !(hasRig && hasDesk)) ||
      (['arm', 'lift', 'vr'].includes(id) && !hasMonitor) ||
      (id === 'screen' && !(hasRig && hasMonitor))
    )
      spaceCheck.splice(i, 1);
  }
  for (let i = desktopChecks.length - 1; i >= 0; i--) {
    const id = desktopChecks[i].id;
    if (!hasDesk || (id === 'mouse-mat' && !(mat && mouse)) || (id === 'mount' && !hasMonitor))
      desktopChecks.splice(i, 1);
  }
  const checks = [...bodyCheck, ...spaceCheck, ...desktopChecks, ...extra, ...room.checks],
    errors = checks.filter((c) => c.level === 'error').length,
    warnings = checks.filter((c) => c.level === 'warning').length;
  return {
    body: hasRig ? body : null,
    bodyCheck,
    spaceCheck,
    desktopChecks,
    desktopItems,
    desktopOverlaps,
    mouseOnMat,
    extra,
    checks,
    errors,
    warnings,
    rigLeft,
    rigRight,
    deskLeft,
    deskRight,
    deskBack,
    deskFront,
    monitorW,
    monitorH,
    clampPoint,
    monitorPoint,
    reach,
    lift,
    spaceW,
    spaceD,
    allLeft,
    allRight,
    allBack,
    allFront,
    freeW,
    freeD,
    lowerZ,
    upperZ,
    sideGap,
    rigPose,
    deskPose,
    rigPolygon,
    deskPolygon,
    tabletopPolygon,
    deskBounds: bounds,
    monitorAngle,
    armPose,
    drivingMount: driving,
    collisionCount,
    roomFits,
    roomBounds,
    clearances,
    aisleFits,
    freeBand,
    room,
    ...getParts(s),
  };
}
