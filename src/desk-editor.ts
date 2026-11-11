// Desk tab: placing the desk, the cockpit and the items on the tabletop, and the monitor shortcuts.
import type { CockpitConfig, NumericField } from './config.ts';
import type { CockpitEvaluation } from './evaluate.ts';
import { clampEdge, desktopTargets } from './desk.ts';
import { groupHTML as group, type ControlTemplates } from './controls-view.ts';

export function monitorShortcuts(s: CockpitConfig): string {
  if (s.deskEnabled === false || s.monitorEnabled === false) return '';
  return `<div class="arm-shortcuts"><button data-monitor-pose="cockpit" aria-pressed="${s.monitorMode === 'cockpit' && s.cockpitEnabled !== false}" ${s.cockpitEnabled === false ? 'disabled' : ''}>Llevar al cockpit</button><button data-monitor-pose="desk" aria-pressed="${s.monitorMode === 'desk'}">Llevar al escritorio</button></div>${s.cockpitEnabled === false ? '<p class="layout-hint">Añade un cockpit para poder llevar el monitor hasta él.</p>' : ''}`;
}

// Shared by step 4 and the complete editor; positions remain local to the desk.
export function deskElementControls(
  s: CockpitConfig,
  e: CockpitEvaluation,
  target: string,
  { range, select }: Pick<ControlTemplates, 'range' | 'select'>,
): string {
  let html = '';
  const item = desktopTargets.find((t) => t.id === target),
    prefix = item ? item.prefix : target;
  // Position settings of the selected item: `<prefix>X`, `<prefix>Z` and `<prefix>Angle`.
  const setting = (suffix: 'X' | 'Z' | 'Angle') => `${prefix}${suffix}` as NumericField;
  const picker = `<div class="select-control target-picker"><label for="layoutTargetSelect">Elemento a mover</label><select id="layoutTargetSelect"><optgroup label="Distribución del espacio">${s.cockpitEnabled !== false ? `<option value="cockpit" ${target === 'cockpit' ? 'selected' : ''}>Cockpit</option>` : ''}<option value="desk" ${target === 'desk' ? 'selected' : ''}>Escritorio completo</option></optgroup><optgroup label="Sobre el tablero">${desktopTargets
    .filter((t) => e.desktopItems.some((i) => i.id === t.id))
    .map((t) => `<option value="${t.id}" ${target === t.id ? 'selected' : ''}>${t.label}</option>`)
    .join('')}</optgroup></select></div>`;
  let placement = '';
  if (target === 'arm') {
    placement += select('clampMount', 'Fijación', [
      ['clamp', 'Mordaza al borde'],
      ['grommet', 'Pasante / taladro'],
    ]);
    if (s.clampMount === 'clamp') {
      const edge = clampEdge(s);
      placement +=
        `<div class="select-control"><label for="clampEdgeSelect">Borde del tablero</label><select id="clampEdgeSelect">${[
          ['xmin', 'Trabajo (−X)'],
          ['xmax', 'Posterior (+X)'],
          ['zmin', 'Extremo −Z'],
          ['zmax', 'Extremo +Z'],
        ]
          .map(
            ([value, label]) =>
              `<option value="${value}" ${edge === value ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></div>` +
        range(edge[0] === 'x' ? 'clampZ' : 'clampX', 'Posición a lo largo del borde');
    } else
      placement +=
        range('clampX', 'Posición X en tablero') + range('clampZ', 'Posición Z en tablero');
    placement +=
      '<button class="arm-edit-action" id="armDragBtn">Mover monitor y brazo ↗</button><p class="layout-hint">Mueve el anclaje, no la pantalla. Al arrastrar con mordaza se ajusta al borde más cercano. La fijación pasante permite colocarlo en el interior y requiere un taladro o pasacables compatible.</p>';
  } else {
    placement +=
      range(setting('X'), item ? 'Posición X en tablero' : 'Posición X (lateral)') +
      range(setting('Z'), item ? 'Posición Z en tablero' : 'Posición Z (fondo)') +
      range(setting('Angle'), 'Giro en planta') +
      `<div class="rotate-actions"><button data-rotate="-90">↶ −90°</button><button data-rotate="90">+90° ↷</button></div>`;
    placement += `<p class="layout-hint" ${item ? 'data-desktop-hint' : ''}>${item ? `Referencia: centro del tablero, que gira con la mesa. X recorre los ${s.deskDepth} cm de fondo; Z los ${s.deskWidth} cm de ancho.` : target === 'desk' ? 'Referencia: centro del tablero en el espacio.' : 'Referencia: centro del extremo trasero del chasis.'} Selecciona y arrastra en las vistas <b>Mesa</b> o <b>Planta</b>. También puedes escribir la posición y el giro aquí.</p>`;
  }
  html += group(
    'Colocar elementos',
    picker + placement,
    item ? 'Sobre el tablero' : 'En el espacio',
  );
  if (target === 'keyboard')
    html += group(
      'Tamaño del teclado',
      range('keyboardWidth', 'Ancho del teclado') + range('keyboardDepth', 'Fondo del teclado'),
    );
  if (target === 'pc')
    html += group(
      'Tamaño del PC',
      range('pcWidth', 'Ancho de torre') +
        range('pcDepth', 'Fondo de torre') +
        range('pcHeight', 'Altura de torre'),
    );
  if (target === 'mouse')
    html +=
      '<p class="control-hint">Ratón de 12 × 7 cm aprox. Puedes colocarlo y girarlo independientemente del teclado y la alfombrilla.</p>';
  if (target === 'mat')
    html += group(
      'Alfombrilla XL',
      `<div class="select-control"><label for="matPreset">Medida rápida</label><select id="matPreset"><option value="custom">Personalizada</option><option value="90x40">90 × 40 cm</option><option value="120x60">120 × 60 cm</option><option value="140x80">140 × 80 cm</option></select></div>` +
        range('matWidth', 'Ancho de alfombrilla') +
        range('matDepth', 'Fondo de alfombrilla'),
    );
  return html;
}
