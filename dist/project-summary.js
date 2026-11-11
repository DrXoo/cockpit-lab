import { escapeHTML as esc } from './room-editor.js?v=12-setup';
import { steps } from './project.js?v=12-setup';
import { wrapAngle, rigLift, floorHeight } from './model.js?v=14-base-height';

const title = (text) => `<h3 class="summary-title">${text}</h3>`;
const dims = (rows) =>
  `<div class="summary-dims">${rows.map(([key, value]) => `<p>${esc(key)}<b>${esc(value)}</b></p>`).join('')}</div>`;
const table = (head, rows) =>
  `<table class="summary-table"><thead><tr>${head.map((v) => `<th>${esc(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
export function partialSummary(s, e, setup, roomHTML = '') {
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
            [
              'Volante · posición / altura',
              `${s.wheelZ} / ${floorHeight(s, 'wheelH')} cm · ${s.wheelTilt}°`,
            ],
          ]
        : []),
      ...(s.hotas || s.shifter || s.handbrake
        ? [
            [
              'Mandos laterales · posición / altura',
              `${s.hotasZ} / ${floorHeight(s, 'hotasH')} cm · salida ${s.hotasOut} cm`,
            ],
          ]
        : []),
      ...(s.centerStick
        ? [['Joystick central · posición / altura', `${s.stickZ} / ${floorHeight(s, 'stickH')} cm`]]
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
      `<div class="summary-checks">${e.checks.map((c) => `<p>${c.level === 'ok' ? '✓' : c.level === 'error' ? '×' : '!'} ${esc(c.label)}: <b>${esc(c.value)}</b> — ${esc(c.detail)}</p>`).join('')}</div>`;
  if (s.cockpitEnabled)
    html +=
      '<p class="summary-note">Medidas y comprobaciones orientativas mediante envolventes. La reserva lateral no garantiza una ruta de acceso. Los cortes son longitudes netas sin ancho de sierra. Las prolongaciones de base requieren uniones y arriostramiento por definir; sus fijaciones no se incluyen en las estimaciones. Las fijaciones son estimaciones del configurador; verifica medidas, patrones de montaje, ranura, cargas y anclajes antes de fabricar. No es un plano de fabricación validado.</p>';
  else if (s.roomEnabled)
    html +=
      '<p class="summary-note">Las comprobaciones usan envolventes aproximadas. La reserva lateral no garantiza una ruta de acceso continua.</p>';
  html += '</div>';
  return html;
}
