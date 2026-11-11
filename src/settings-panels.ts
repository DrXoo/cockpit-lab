// Settings panels of the complete editor: cockpit rig, seated posture and desk.
import { round } from './geometry.ts';
import { bindControls, groupHTML as group, type ControlView } from './controls-view.ts';
import { accessoryControls, placementControls } from './setup-editor.ts';
import { deskElementControls, monitorShortcuts } from './desk-editor.ts';

export function rigPanelHTML(view: ControlView): string {
  const { range, toggle, select } = bindControls(view);
  let html = '';
  html +=
    '<button class="arm-edit-action" id="bodySettings">Ajustar asiento, postura y mandos →</button>';
  html += placementControls('cockpit', range);
  html += group(
    'Base de aluminio',
    range('length', 'Largo del chasis') +
      range('width', 'Ancho exterior') +
      range('baseLift', 'Elevación de la base') +
      '<p class="layout-hint">Sube juntos el asiento, el volante, los pedales y los mandos laterales, conservando tu postura. 0 cm mantiene la base original. Los pies o ruedas siguen en el suelo. La mesa y el monitor conservan su altura.</p>',
    '40 × 80 / 40 × 40',
  );
  html += group(
    'Módulos y mandos',
    toggle('wheel', 'Volante y base DD') +
      toggle('hotas', 'HOTAS lateral') +
      toggle('centerStick', 'Joystick central') +
      toggle('shifter', 'Cambio en H') +
      toggle('handbrake', 'Freno de mano') +
      select('drivingSide', 'Lado del cambio y freno', [
        ['right', 'Derecha del piloto'],
        ['left', 'Izquierda del piloto'],
      ]) +
      select('feet', 'Apoyo', [
        ['level', 'Pies niveladores'],
        ['casters', 'Ruedas con freno'],
      ]),
  );
  html +=
    '<p class="control-hint">Derecha e izquierda del cambio y freno se miran sentado al volante. Chasis fijo y módulos desmontables. El ancho total incluye los accesorios activos. La selección de perfiles es preliminar; no calcula rigidez para tu base DD.</p>';
  return html;
}

export function bodyPanelHTML(view: ControlView): string {
  const { range, toggle, select } = bindControls(view);
  const { state } = view;
  let html = '';
  html += '<button class="arm-edit-action" id="rigSettings">← Volver al cockpit</button>';
  html += group('Tu punto de partida', range('height', 'Tu estatura'));
  html += group(
    'Asiento',
    range('seatZ', 'Posición longitudinal') +
      range('seatH', 'Altura del cojín') +
      range('recline', 'Reclinación del respaldo'),
    'Desde atrás / suelo',
  );
  if (state.wheel)
    html += group(
      'Volante',
      range('wheelZ', 'Posición longitudinal') +
        range('wheelH', 'Altura del centro') +
        range('wheelTilt', 'Inclinación de la base'),
    );
  html += group(
    'Pedalera',
    range('pedalZ', 'Posición longitudinal') +
      range('pedalH', 'Altura de plataforma') +
      range('pedalTilt', 'Inclinación de plataforma'),
  );
  if (state.hotas || state.shifter || state.handbrake)
    html += group(
      'Mandos laterales',
      range('hotasZ', 'Posición longitudinal') +
        range('hotasH', 'Altura de las placas') +
        range('hotasOut', 'Salida desde el chasis'),
    );
  if (state.centerStick)
    html += group(
      'Joystick central',
      range('stickZ', 'Posición longitudinal') + range('stickH', 'Altura de la placa'),
    );
  html +=
    '<p class="control-hint">Las posiciones parten del extremo trasero del chasis y las alturas, del suelo, incluida la elevación de la base. Ajusta la elevación del conjunto en Cockpit → Base de aluminio. Reclinar se mide desde la vertical. Activa el piloto para explorar la postura.</p>';
  return html;
}

export function deskPanelHTML(view: ControlView, layoutTarget: string): string {
  const { range, toggle, select } = bindControls(view);
  const { state, evaluation } = view;
  let html = '';
  html += accessoryControls(toggle);
  const size = `${state.deskWidth}x${state.deskDepth}`;
  html += group(
    'Tablero de la mesa',
    `<div class="select-control"><label for="deskSizePreset">Medida rápida</label><select id="deskSizePreset"><option value="custom">Personalizada</option>${['120x60', '120x80', '140x60', '140x80', '160x80', '180x80', '200x80'].map((value) => `<option value="${value}" ${value === size ? 'selected' : ''}>${value.replace('x', ' × ')} cm</option>`).join('')}</select></div>` +
      range('deskWidth', 'Ancho del tablero') +
      range('deskDepth', 'Fondo del tablero') +
      '<p class="layout-hint">Ancho × fondo. Los objetos conservan su tamaño y se recolocan dentro del tablero cuando caben. Los pies de referencia mantienen 66 cm de fondo.</p>',
    'Ancho × fondo',
  );
  if (state.monitorEnabled !== false) {
    html += group(
      'Monitor y brazo articulado',
      monitorShortcuts(state) +
        select('monitorMode', 'Posición del monitor', [
          ['cockpit', 'Frente al cockpit'],
          ['desk', 'Sobre escritorio'],
          ['vr', 'VR · aparcado'],
          ['manual', 'Articulaciones manuales'],
        ]) +
        `<button class="arm-edit-action" id="armControlsDragBtn">Editar articulaciones en planta ↗</button>` +
        range('armBaseAngle', 'Giro de la base') +
        range('armElbowAngle', 'Flexión del codo') +
        range('monitorYaw', 'Giro de la pantalla (VESA)') +
        select('armBend', 'Lado de flexión', [
          ['positive', 'Codo hacia un lado'],
          ['negative', 'Codo hacia el otro'],
        ]) +
        range('monitorH', 'Altura centro VESA') +
        range('monitorAhead', 'Pantalla delante volante') +
        range('monitorInches', 'Diagonal de pantalla') +
        '<p class="layout-hint">Arrastra <b>CODO</b> para girar el primer tramo o <b>VESA</b> para mover el extremo. Los controles de giro activan el modo manual. Los botones de colocación vuelven a calcular la postura hacia el destino.</p>',
    ).replace('<div class="control-group">', '<div class="control-group" id="armControls">');
    html += group(
      'Medidas del brazo',
      range('armReach', 'Longitud total de los tramos') +
        range('armSplit', 'Primer tramo (% del total)') +
        `<p class="layout-hint" id="armLengths">Primer tramo: ${round(evaluation.armPose.first)} cm · segundo tramo: ${round(evaluation.armPose.second)} cm. El codo a 0° deja el brazo estirado; ±180° lo pliega.</p>` +
        range('armMinH', 'Altura VESA mínima') +
        range('armMaxH', 'Altura VESA máxima'),
      'Modelo genérico de 2 tramos',
    );
  }
  html += deskElementControls(state, evaluation, layoutTarget, { range, select });
  if (state.cockpitEnabled !== false)
    html += group(
      'Colocación rápida',
      `<div class="select-control"><label for="layoutPreset">Mesa respecto al cockpit</label><select id="layoutPreset"><option value="free">Personalizada</option><option value="right">Mesa a la derecha</option><option value="left">Mesa a la izquierda</option><option value="front">Mesa enfrente</option></select></div>`,
    );
  html += group('Altura de mesa', range('deskH', 'Altura del tablero'), 'Altura desde suelo');
  html += '<button class="arm-edit-action" id="goRoom">Habitación, puertas y muebles ↗</button>';
  html +=
    '<p class="control-hint">Posición y giro de mesa y cockpit independientes. La zona permanece fija al moverlos. El brazo mantiene dos tramos de longitud fija y comprueba su alcance mínimo/máximo y altura VESA. Los giros son en planta; verifica los topes y cargas del modelo real. Diagonal en pulgadas (″), resto en cm. Configura paredes, puertas, ventanas y muebles en la pestaña Habitación.</p>';
  return html;
}
