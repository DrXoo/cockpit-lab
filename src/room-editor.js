import { round } from './geometry.js';
import { wallFrame, wallNames, furnitureNames } from './room.js';
export const escapeHTML = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function roomItem(s, target) {
  return target.startsWith('feature:')
    ? s.roomFeatures.find((v) => v.id === target.slice(8))
    : target.startsWith('furniture:')
      ? s.roomFurniture.find((v) => v.id === target.slice(10))
      : null;
}
export function roomItems(s, mode) {
  return mode === 'furniture'
    ? [...s.roomFurniture, ...s.roomFeatures.filter((v) => v.type === 'wardrobeAccess')]
    : ['openings', 'room'].includes(mode)
      ? s.roomFeatures.filter((v) => v.type !== 'wardrobeAccess')
      : [...s.roomFeatures, ...s.roomFurniture];
}
export function roomValue(s, target, key) {
  const item = roomItem(s, target);
  if (!item)
    return key === 'x'
      ? round(s[target + 'X'] - s.roomX)
      : key === 'z'
        ? round(s[target + 'Z'] - s.roomZ)
        : s[target + 'Angle'];
  return key === 'x' ? round(item.x - s.roomX) : key === 'z' ? round(item.z - s.roomZ) : item[key];
}
export function roomControls(s, e, target, range, toggle, { mode = 'all' } = {}) {
  const items = roomItems(s, mode);
  const choices = [
    ...(mode === 'all' && s.deskEnabled !== false ? ['desk'] : []),
    ...(mode === 'all' && s.cockpitEnabled !== false ? ['cockpit'] : []),
    ...items.map((v) => (v.wall ? 'feature:' : 'furniture:') + v.id),
  ];
  const active = choices.includes(target) ? target : choices[0],
    item = active ? roomItem(s, active) : null,
    a = escapeHTML;
  const num = (key, label, min, max, step = 1, unit = 'cm') => {
    const value = roomValue(s, active, key);
    return `<div class="control room-object-control"><div class="control-top"><label for="room-${key}-range">${label}</label><div class="number-wrap"><input id="room-${key}-number" type="number" data-room-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}"><span>${unit}</span></div></div><input id="room-${key}-range" type="range" data-room-key="${key}" min="${min}" max="${max}" step="${step}" value="${value}" aria-label="${label}" style="--pct:${((value - min) / (max - min || 1)) * 100}%"></div>`;
  };
  const sel = (key, label, options) =>
    `<div class="select-control"><label for="room-${key}">${label}</label><select id="room-${key}" data-room-key="${key}">${options.map(([v, n]) => `<option value="${v}" ${item?.[key] === v ? 'selected' : ''}>${a(n)}</option>`).join('')}</select></div>`;
  const group = (title, body) =>
    `<div class="control-group"><h3 class="group-title">${title}</h3>${body}</div>`;
  let html = ['all', 'room'].includes(mode)
    ? group(
        'Medidas interiores',
        toggle('roomEnabled', 'Mostrar habitación y comprobar obstáculos') +
          range('roomW', 'Ancho de pared AB') +
          range('roomD', 'Fondo de pared BC') +
          range('roomH', 'Altura de techo') +
          toggle('roomFullWalls', 'Mostrar paredes completas en 3D') +
          `<details class="room-reference"><summary>Referencia y espacio de paso</summary>${range('roomX', 'Origen X de la habitación') + range('roomZ', 'Origen Z de la habitación') + range('aisle', 'Reserva lateral deseada')}<p class="layout-hint">Cambiar el origen mueve las paredes. Mesa, cockpit y muebles conservan su posición.</p></details><div class="room-actions"><button id="roomFrame">Ver habitación en planta</button><button id="roomCenter">Centrar mesa y cockpit</button></div>`,
      )
    : '';
  const addTypes =
    mode === 'furniture'
      ? ['bed', 'wardrobe', 'wardrobeAccess', 'shelf', 'wallShelf', 'cabinet', 'chair', 'obstacle']
      : mode === 'room' || mode === 'openings'
        ? ['door', 'window']
        : [
            'door',
            'window',
            'bed',
            'wardrobe',
            'wardrobeAccess',
            'shelf',
            'wallShelf',
            'cabinet',
            'chair',
            'obstacle',
          ];
  const names = {
    door: 'Puerta',
    window: 'Ventana',
    wardrobeAccess: 'Armario empotrado',
    ...furnitureNames,
  };
  html += group(
    mode === 'furniture' ? 'Añadir mueble' : 'Añadir elementos',
    `<div class="room-add-grid">${addTypes.map((type) => `<button data-add-room="${type}">＋ ${a(names[type])}</button>`).join('')}</div>${
      choices.length
        ? `<div class="select-control target-picker"><label for="roomTarget">Elemento seleccionado</label><select id="roomTarget">${choices
            .map((id) => {
              const v = roomItem(s, id);
              return `<option value="${id}" ${id === active ? 'selected' : ''}>${a(v?.name || (id === 'desk' ? 'Escritorio completo' : 'Cockpit'))}</option>`;
            })
            .join('')}</select></div>`
        : '<p class="room-empty">Todavía no has añadido elementos en este paso.</p>'
    }`,
  );
  if (!active) return html;
  let editor = '';
  if (item)
    editor += `<div class="room-name"><label for="roomName">Nombre</label><input id="roomName" data-room-key="name" value="${a(item.name)}" maxlength="45"></div>`;
  if (item?.type === 'wardrobeAccess') {
    const frame = wallFrame(s, item.wall);
    editor +=
      sel('wall', 'Pared del armario', Object.entries(wallNames)) +
      num('offset', `Inicio del acceso desde ${frame.corner}`, 0, frame.length - item.width, 0.5) +
      num('width', 'Ancho de las puertas correderas', 30, frame.length) +
      num('height', 'Altura de las puertas desde el suelo', 30, s.roomH, 0.5) +
      num('clearance', 'Espacio libre delante', 0, 200, 0.5) +
      '<p class="layout-hint">Solo se representa el frente de puertas correderas y su franja de acceso. No necesitas medir el interior. La altura inicial coincide con el techo: ajústala a tus puertas. El espacio por encima queda disponible. Arrastra el frente a lo largo de la pared; cambia la pared en el selector. La franja debe quedar libre de muebles, mesa y cockpit. Con 0 cm se desactiva la reserva.</p>';
  } else if (item?.wall) {
    const frame = wallFrame(s, item.wall);
    editor +=
      sel('wall', 'Pared', Object.entries(wallNames)) +
      num('offset', `Inicio del hueco desde ${frame.corner}`, 0, frame.length - item.width, 0.5) +
      num('width', 'Ancho del hueco', 30, Math.min(300, frame.length)) +
      num('height', 'Altura del hueco', 30, s.roomH);
    if (item.type === 'door')
      editor +=
        sel('hinge', 'Bisagras', [
          ['start', `Inicio del hueco · cerca de ${frame.corner}`],
          ['end', 'Final del hueco'],
        ]) +
        sel('swing', 'Sentido de apertura', [
          ['in', 'Hacia dentro'],
          ['out', 'Hacia fuera'],
        ]) +
        num('openAngle', 'Ángulo que debe poder abrir', 0, 180, 1, '°') +
        '<p class="layout-hint">El área naranja comprueba todo el barrido desde cerrada hasta este ángulo. Arrastra el hueco a lo largo de su pared; cambia de pared con el selector.</p>';
    else
      editor +=
        num('sill', 'Antepecho desde el suelo', 0, s.roomH - item.height) +
        num('clearance', 'Reserva libre delante', 0, 150) +
        '<p class="layout-hint">La franja azul reserva acceso. El antepecho sitúa la ventana en altura; no se simula el giro de sus hojas.</p>';
  } else {
    if (item) {
      const chair = item.type === 'chair';
      editor +=
        sel('type', 'Tipo de mueble', Object.entries(furnitureNames)) +
        num(
          'width',
          chair ? 'Ancho total de la silla' : 'Ancho del mueble',
          chair ? 40 : 10,
          chair ? 100 : 350,
        ) +
        num(
          'depth',
          chair ? 'Fondo total de la silla' : 'Fondo del mueble',
          chair ? 40 : 10,
          chair ? 100 : 250,
        ) +
        num(
          'height',
          chair ? 'Altura total de la silla' : 'Altura del mueble',
          chair ? 70 : item.type === 'wallShelf' ? 2 : 10,
          chair ? 180 : 350,
        );
      if (chair)
        editor +=
          num('seatHeight', 'Altura del asiento', 30, Math.min(65, item.height - 20)) +
          num('pullback', 'Espacio para retirar la silla', 0, 150) +
          (s.deskEnabled !== false
            ? '<button class="arm-edit-action" id="chairAtDesk">Colocar frente al escritorio ↗</button>'
            : '') +
          '<p class="layout-hint">La huella incluye ruedas y reposabrazos. La franja trasera reserva espacio para apartar la silla; ponla a 0 para ocultarla. La silla se mueve independientemente de la mesa.</p>';
    }
    if (item?.type === 'wallShelf') {
      const frame = wallFrame(s, item.mountWall);
      editor +=
        sel('mountWall', 'Pared de anclaje', Object.entries(wallNames)) +
        num(
          'offset',
          `Inicio desde esquina ${frame.corner}`,
          0,
          Math.max(0, frame.length - item.width),
          0.5,
        ) +
        num('elevation', 'Altura de la base desde el suelo', 0, s.roomH, 0.5) +
        '<p class="layout-hint">Arrastra en planta a lo largo de la pared. Cambia la pared en el selector. La altura de la base deja espacio para otros muebles debajo; se avisa si sus volúmenes se cruzan. El contacto con la pared es intencionado. No se calculan cargas ni fijaciones.</p>';
    } else
      editor +=
        num('x', 'Posición X desde pared DA', -200, s.roomW + 200, 0.5) +
        num('z', 'Posición Z desde pared AB', -200, s.roomD + 200, 0.5) +
        num('angle', 'Giro en planta', 0, 359, 1, '°') +
        `<div class="rotate-actions"><button data-room-rotate="-90">↶ −90°</button><button data-room-rotate="90">+90° ↷</button></div><p class="layout-hint">${active === 'cockpit' ? 'Referencia: centro del extremo trasero del chasis.' : 'Referencia: centro del elemento.'} Arrastra en planta o escribe las distancias a las paredes.</p>`;
  }
  if (item) editor += '<button class="room-delete" id="roomDelete">Eliminar este elemento</button>';
  html += group(
    item ? escapeHTML(item.name) : active === 'cockpit' ? 'Colocar cockpit' : 'Colocar escritorio',
    editor,
  );
  html +=
    '<p class="control-hint">Paredes A–B–C–D en sentido horario desde la esquina superior izquierda. Se comprueban límites, muebles y barrido de puerta con envolventes aproximadas. La reserva lateral no garantiza una ruta continua de entrada.</p>';
  return html;
}
