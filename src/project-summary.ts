// The printable project summary: a partial one while the project is incomplete, and the full
// one with geometry, cut list and checks. Lengths in cm unless a column says mm.
import { escapeHTML as esc } from './html.ts';
import { checkLineHTML } from './check-view.ts';
import { steps, type SetupProgress } from './project.ts';
import { presets, type CockpitConfig } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { wallFrame } from './room.ts';
import { round } from './geometry.ts';
import { wrapAngle } from './monitor-arm.ts';
import { rigLift, floorHeight } from './rig.ts';

/** Elements that must all be present for the full summary. */
const SUMMARY_ELEMENTS = [
  'deskEnabled',
  'cockpitEnabled',
  'monitorEnabled',
  'keyboardEnabled',
  'pcEnabled',
  'mouseEnabled',
  'matEnabled',
] as const;

/** The full summary needs a finished setup with the room and every element. */
export const usesPartialSummary = (s: CockpitConfig, setup: SetupProgress): boolean =>
  !s.roomEnabled || setup.step !== 'complete' || SUMMARY_ELEMENTS.some((key) => s[key] === false);

export const summaryHeading = (s: CockpitConfig) =>
  s.cockpitEnabled
    ? { title: 'Tu cockpit, pieza a pieza.', kicker: 'DEL DISEÑO AL TALLER' }
    : { title: 'Resumen del proyecto', kicker: 'TU ESPACIO' };

type Cell = string | number;
type Row = [label: string, value: Cell];

const row = (label: string, value: Cell): Row => [label, value];

const title = (text: string) => `<h3 class="summary-title">${text}</h3>`;
const dims = (rows: Row[]) =>
  `<div class="summary-dims">${rows.map(([key, value]) => `<p>${esc(key)}<b>${esc(value)}</b></p>`).join('')}</div>`;
const table = (head: string[], rows: Cell[][]) =>
  `<table class="summary-table"><thead><tr>${head.map((v) => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function partialSummary(
  s: CockpitConfig,
  e: CockpitEvaluation,
  setup: SetupProgress,
  roomHTML = '',
): string {
  let html = '<div class="summary-inner">';
  const pending = setup.deferred
    .map((id) => steps.find((step) => step.id === id)?.label)
    .filter(Boolean);
  if (setup.step !== 'complete')
    html += `<p class="summary-note">Proyecto en preparación · paso ${esc(steps.find((step) => step.id === setup.step)?.label || 'Habitación')}. Se incluyen solo los elementos añadidos.</p>`;
  if (pending.length)
    html += `<p class="summary-note">Por completar: ${pending.map(esc).join(', ')}.</p>`;
  html += title('Tu espacio');
  html += s.roomEnabled
    ? dims([
        ['Habitación · ancho × fondo', `${s.roomW} × ${s.roomD} cm`],
        ['Altura de techo', `${s.roomH} cm`],
      ])
    : '<p>Habitación pendiente de definir.</p>';
  html += roomHTML;
  if (s.deskEnabled) {
    html +=
      title('Mesa') +
      dims([
        ['Tablero · ancho × fondo', `${s.deskWidth} × ${s.deskDepth} cm`],
        ['Altura', `${s.deskH} cm`],
        ['Posición X / Z', `${s.deskX} / ${s.deskZ} cm`],
        ['Giro', `${s.deskAngle}°`],
      ]);
    if (e.desktopItems.length)
      html +=
        title('Accesorios añadidos') +
        table(
          ['Elemento', 'Huella X × Z (cm)', 'Posición X / Z (cm)', 'Giro'],
          e.desktopItems.map((i) => [
            i.label,
            `${i.sizeX} × ${i.sizeZ}`,
            `${i.local.x} / ${i.local.z}`,
            `${i.local.angle}°`,
          ]),
        );
    if (s.monitorEnabled)
      html +=
        title('Monitor y brazo') +
        dims([
          ['Diagonal', `${s.monitorInches}″`],
          ['Altura VESA', `${s.monitorH} cm`],
          [
            'Modo',
            { cockpit: 'Cockpit', desk: 'Escritorio', manual: 'Manual', vr: 'VR · aparcado' }[
              s.monitorMode
            ],
          ],
          ['Tramos del brazo', `${e.armPose.first} + ${e.armPose.second} cm`],
          ['Alcance necesario', `${Math.round(e.reach)} cm`],
          [
            'Giros base / codo / VESA',
            `${e.armPose.baseAngle.toFixed(1)}° / ${e.armPose.elbowAngle.toFixed(1)}° / ${wrapAngle(e.monitorAngle - s.deskAngle).toFixed(1)}°`,
          ],
        ]);
  }
  if (s.cockpitEnabled) {
    html +=
      '<p class="summary-note">Alturas desde suelo, incluida la elevación de la base. Posiciones desde el extremo trasero del chasis.</p>';
    html +=
      title('Cockpit') +
      dims([
        ['Chasis', `${s.length} × ${s.width} cm`],
        [
          'Elevación de la base',
          `${rigLift(s)} cm · eje del chasis a ${10 + rigLift(s)} cm del suelo`,
        ],
        ['Estatura', `${s.height} cm`],
        ['Asiento · posición / altura', `${s.seatZ} / ${floorHeight(s, 'seatH')} cm`],
        ['Reclinación', `${s.recline}°`],
        ['Posición X / Z', `${s.cockpitX} / ${s.cockpitZ} cm`],
        ['Giro', `${s.cockpitAngle}°`],
      ]);
    html += dims([
      [
        'Pedalera · posición / altura',
        `${s.pedalZ} / ${floorHeight(s, 'pedalH')} cm · ${s.pedalTilt}°`,
      ],
      ...(s.wheel
        ? [
            row(
              'Volante · posición / altura',
              `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°`,
            ),
          ]
        : []),
      ...(s.hotas || s.shifter || s.handbrake
        ? [
            row(
              'Mandos laterales · posición / altura',
              `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · salida ${s.hotasOut} cm`,
            ),
          ]
        : []),
      ...(s.centerStick
        ? [
            row(
              'Joystick central · posición / altura',
              `${s.stickZ} / ${floorHeight(s, 'stickH')} cm`,
            ),
          ]
        : []),
      [
        'Cambio y freno',
        s.shifter || s.handbrake
          ? s.drivingSide === 'left'
            ? 'Izquierda del piloto'
            : 'Derecha del piloto'
          : 'Desactivados',
      ],
      [
        'Perfil neto orientativo',
        `${(e.totalMm / 1000).toLocaleString('es-ES')} m · ${e.cuts} cortes`,
      ],
    ]);
    html +=
      title('Lista de cortes orientativa') +
      table(
        ['Pieza', 'Perfil (mm)', 'Ud.', 'Largo (mm)', 'Total (mm)'],
        e.parts.map((p) => [p.name, p.profile, p.qty, p.mm, p.total]),
      );
  }
  if (e.accessories.length)
    html +=
      title('Piezas y fijaciones') +
      table(
        ['Componente', 'Detalle', 'Ud.'],
        e.accessories.map((p) => [p.name, p.note, p.qty]),
      );
  if (e.checks.length)
    html +=
      title('Comprobaciones') +
      `<div class="summary-checks">${e.checks.map(checkLineHTML).join('')}</div>`;
  if (s.cockpitEnabled)
    html +=
      '<p class="summary-note">Medidas y comprobaciones orientativas mediante envolventes. La reserva lateral no garantiza una ruta de acceso. Los cortes son longitudes netas sin ancho de sierra. Las prolongaciones de base requieren uniones y arriostramiento por definir; sus fijaciones no se incluyen en las estimaciones. Las fijaciones son estimaciones del configurador; verifica medidas, patrones de montaje, ranura, cargas y anclajes antes de fabricar. No es un plano de fabricación validado.</p>';
  else if (s.roomEnabled)
    html +=
      '<p class="summary-note">Las comprobaciones usan envolventes aproximadas. La reserva lateral no garantiza una ruta de acceso continua.</p>';
  html += '</div>';
  return html;
}

export function roomSummaryHTML(s: CockpitConfig): string {
  if (s.roomEnabled === false) return '';
  const a = esc;
  return `<h3 class="summary-title">Habitación y obstáculos<span>Medidas en cm</span></h3><table class="summary-table"><thead><tr><th>Elemento</th><th>Ubicación</th><th>Medidas / apertura</th></tr></thead><tbody>${s.roomFeatures.map((v) => `<tr><td>${a(v.name)}</td><td>Pared ${wallFrame(s, v.wall).corner} · inicio ${v.offset}</td><td>${v.type === 'wardrobeAccess' ? `Puertas correderas · ancho ${v.width} · alto ${v.height} · acceso libre delante ${v.clearance}` : `${v.width} × ${v.height} · ${v.type === 'door' ? v.openAngle + '° ' + (v.swing === 'in' ? 'interior' : 'exterior') : 'antepecho ' + v.sill + ' · reserva ' + v.clearance}`}</td></tr>`).join('')}${s.roomFurniture.map((v) => `<tr><td>${a(v.name)}</td><td>${v.type === 'wallShelf' ? `Pared ${wallFrame(s, v.mountWall).corner} · inicio ${v.offset} · base ${v.elevation} cm` : `X ${round(v.x - s.roomX)} / Z ${round(v.z - s.roomZ)} · ${v.angle}°`}</td><td>${v.width} × ${v.depth} × ${v.height}${v.type === 'chair' ? ` · asiento ${v.seatHeight} · retirada ${v.pullback}` : ''}</td></tr>`).join('')}</tbody></table>`;
}

export function fullSummaryHTML(s: CockpitConfig, e: CockpitEvaluation): string {
  const fmt = (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: 2 });
  const dims = [
    ['Preset', presets[s.preset].label],
    ['Estatura de referencia', `${s.height} cm`],
    ['Elevación de la base', `${rigLift(s)} cm · eje del chasis a ${10 + rigLift(s)} cm del suelo`],
    ['Chasis exterior', `${s.length} × ${s.width} cm`],
    ['Ancho con accesorios', `${Math.ceil(e.rigRight - e.rigLeft)} cm`],
    ['Asiento · posición / altura', `${s.seatZ} / ${floorHeight(s, 'seatH')} cm`],
    ['Respaldo desde vertical', `${s.recline}°`],
    [
      'Volante · posición / centro',
      s.wheel ? `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°` : 'Desactivado',
    ],
    [
      'Pedalera · posición / altura',
      `${s.pedalZ} / ${floorHeight(s, 'pedalH')} cm · ${s.pedalTilt}°`,
    ],
    [
      'Mandos laterales · pos. / altura',
      s.hotas || s.shifter || s.handbrake
        ? `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · salida ${s.hotasOut}`
        : 'Desactivados',
    ],
    [
      'Cambio y freno · lado',
      s.shifter || s.handbrake
        ? s.drivingSide === 'left'
          ? 'Izquierda del piloto'
          : 'Derecha del piloto'
        : 'Desactivados',
    ],
    [
      'Joystick central · pos. / altura',
      s.centerStick ? `${s.stickZ} / ${floorHeight(s, 'stickH')} cm` : 'Desactivado',
    ],
    ['Mesa · tablero / altura', `${s.deskWidth} × ${s.deskDepth} / ${s.deskH} cm`],
    ['Mesa · posición X / Z', `${s.deskX} / ${s.deskZ} cm`],
    ['Mesa · giro en planta', `${s.deskAngle}°`],
    ['Cockpit · posición X / Z', `${s.cockpitX} / ${s.cockpitZ} cm`],
    ['Cockpit · giro en planta', `${s.cockpitAngle}°`],
    ['Habitación · ancho / fondo / alto', `${s.roomW} / ${s.roomD} / ${s.roomH} cm`],
    ['Habitación · origen X / Z', `${s.roomX} / ${s.roomZ} cm`],
    ['Monitor · diagonal / altura', `${s.monitorInches}″ / ${s.monitorH} cm`],
    [
      'Monitor · modo',
      {
        cockpit: 'Cockpit',
        desk: 'Escritorio',
        vr: 'VR · aparcado',
        manual: 'Articulaciones manuales',
      }[s.monitorMode],
    ],
    ['Anclaje · X / Z en tablero', `${s.clampX} / ${s.clampZ} cm`],
    ['Anclaje · fijación', s.clampMount === 'grommet' ? 'Pasante' : 'Mordaza'],
    ['Brazo · necesario / declarado', `${Math.round(e.reach)} / ${s.armReach} cm`],
    ['Brazo · tramos base / terminal', `${round(e.armPose.first)} / ${round(e.armPose.second)} cm`],
    [
      'Brazo · base / codo / VESA',
      `${round(e.armPose.baseAngle)}° / ${round(e.armPose.elbowAngle)}° / ${round(wrapAngle(e.monitorAngle - s.deskAngle))}°`,
    ],
    ['Zona libre / paso deseado', `${s.roomW} × ${s.roomD} / ${s.aisle} cm`],
  ];
  return `<div class="summary-inner"><div class="summary-stats"><div><small>Chasis exterior</small><b>${s.length} × ${s.width} cm</b></div><div><small>Conjunto sin paso</small><b>${Math.ceil(e.spaceW)} × ${Math.ceil(e.spaceD)} cm</b></div><div><small>Perfil neto / +10 % compra</small><b>${fmt(e.totalMm / 1000)} / ${fmt((e.totalMm / 1000) * 1.1)} m</b></div><div><small>Cortes de aluminio</small><b>${e.cuts} piezas</b></div></div><h3 class="summary-title">Geometría de tu configuración<span>Alturas desde suelo · posiciones desde atrás</span></h3><div class="summary-dims">${dims.map(([n, v]) => `<p>${n}<b>${v}</b></p>`).join('')}</div>${roomSummaryHTML(s)}<h3 class="summary-title">Sobre el escritorio<span>Coordenadas desde el centro del tablero</span></h3><table class="summary-table"><thead><tr><th>Elemento</th><th>Huella X × Z (cm)</th><th>Posición X / Z (cm)</th><th>Giro</th></tr></thead><tbody>${e.desktopItems.map((i) => `<tr><td>${i.label}</td><td>${i.sizeX} × ${i.sizeZ}${i.id === 'pc' ? ` · h ${s.pcHeight}` : ''}</td><td>${i.local.x} / ${i.local.z}</td><td>${i.local.angle}°</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Comprobaciones<span>${e.errors} pendientes · ${e.warnings} avisos</span></h3><div class="summary-checks">${e.checks.map(checkLineHTML).join('')}</div><h3 class="summary-title">Lista de cortes orientativa<span>Longitudes netas · sin ancho de sierra</span></h3><table class="summary-table"><thead><tr><th>Pieza</th><th>Perfil (mm)</th><th>Ud.</th><th>Largo (mm)</th><th>Total (mm)</th></tr></thead><tbody>${e.parts.map((p) => `<tr><td>${p.name}</td><td>${p.profile}</td><td>${p.qty}</td><td>${p.mm}</td><td>${p.total}</td></tr>`).join('')}</tbody></table><h3 class="summary-title">Piezas y fijaciones<span>Cantidades preliminares</span></h3><table class="summary-table"><thead><tr><th>Componente</th><th>Detalle</th><th>Ud.</th></tr></thead><tbody>${e.accessories.map((p) => `<tr><td>${p.name}</td><td>${p.note}</td><td>${p.qty}</td></tr>`).join('')}</tbody></table><div class="summary-note"><b>Antes de pedir o cortar:</b> las prolongaciones de base requieren uniones y arriostramiento por definir; sus fijaciones no se incluyen en las estimaciones. el despiece supone largueros exteriores y travesaños entre caras interiores (ancho − 80 mm), eje de base a ${(10 + rigLift(s)) * 10} mm sobre suelo y módulos sobre escuadras. La altura de cojín es una medida corporal objetivo: adapta los apoyos al espesor y raíles de tu asiento. Las placas se modelan como envolventes, sin taladros. Añade margen de corte y verifica ranura, escuadras, espesor de placas, anclajes y carga con el proveedor. No es un cálculo estructural ni un plano de fabricación validado. Los perfiles 40 × 80 convencionales no se telescopan entre sí. El brazo usa dos tramos de longitud fija con giros horizontales; verifica VESA, peso, topes de giro y recorrido reales.</div></div>`;
}
