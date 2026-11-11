import { defaults, sanitize } from './model.ts';

export const steps = [
  {
    id: 'room',
    label: 'Habitación',
    title: '¿Cuánto mide tu habitación?',
    hint: 'Introduce las medidas interiores. Después colocaremos puertas, ventanas y muebles.',
  },
  {
    id: 'openings',
    label: 'Huecos',
    title: 'Puertas y ventanas',
    hint: 'Añade cada hueco, elige su pared y ajusta sus medidas y apertura.',
  },
  {
    id: 'furniture',
    label: 'Muebles',
    title: 'Lo que ya ocupa espacio',
    hint: 'Añade cama, armario y otros muebles. Arrástralos en planta o escribe su posición.',
  },
  {
    id: 'desk',
    label: 'Mesa',
    title: 'Coloca tu mesa',
    hint: 'Introduce sus medidas y sitúala en la habitación. Añade solo los accesorios que utilizas.',
  },
  {
    id: 'cockpit',
    label: 'Cockpit',
    title: 'Ahora, tu cockpit',
    hint: 'Elige una base, ajusta sus medidas y colócala en el espacio disponible.',
  },
];
export const completeSetup = () => ({ step: 'complete', furthest: 4, deferred: [] });
function readDrafts(input: any = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Borrador inválido');
  const drafts: Record<string, any> = {};
  for (const [group, keys] of Object.entries({ room: ['w', 'd', 'h'], desk: ['w', 'd', 'h'] })) {
    if (input[group] === undefined) continue;
    if (!input[group] || typeof input[group] !== 'object')
      throw new Error('Medidas en borrador inválidas');
    drafts[group] = {};
    for (const key of keys) {
      const value = input[group][key];
      if (value === undefined) continue;
      if (
        typeof value !== 'string' ||
        value.length > 32 ||
        (value !== '' && !Number.isFinite(Number(value)))
      )
        throw new Error('Medida en borrador inválida');
      drafts[group][key] = value;
    }
  }
  if (input.preset !== undefined) {
    if (!['', 'gt', 'flight', 'hybrid', 'small'].includes(input.preset))
      throw new Error('Base en borrador inválida');
    drafts.preset = input.preset;
  }
  return drafts;
}
export function createProject() {
  return {
    config: sanitize({
      ...structuredClone(defaults),
      roomX: 0,
      roomZ: 0,
      roomEnabled: false,
      deskEnabled: false,
      cockpitEnabled: false,
      monitorEnabled: false,
      keyboardEnabled: false,
      pcEnabled: false,
      mouseEnabled: false,
      matEnabled: false,
    }),
    setup: { step: 'room', furthest: 0, deferred: [] },
  };
}
export function readProject(data, { stored = false } = {}) {
  if (!data || (!stored && data.app !== 'Cockpit Lab')) throw new Error('Archivo de otro programa');
  if (!data.config || typeof data.config !== 'object' || Array.isArray(data.config))
    throw new Error('Configuración inválida');
  if (data.version === 1) {
    if (data.units && data.units !== 'cm') throw new Error('Las configuraciones v1 usan cm');
    // Adaptador explícito: los proyectos anteriores siempre contenían mesa y cockpit.
    return {
      config: sanitize({
        ...data.config,
        deskEnabled: true,
        cockpitEnabled: true,
        monitorEnabled: true,
        keyboardEnabled: true,
        pcEnabled: true,
        mouseEnabled: true,
        matEnabled: true,
      }),
      setup: completeSetup(),
    };
  }
  if (data.version !== 2 || data.units !== 'cm')
    throw new Error('Versión o unidades no compatibles');
  for (const key of [
    'deskEnabled',
    'cockpitEnabled',
    'monitorEnabled',
    'keyboardEnabled',
    'pcEnabled',
    'mouseEnabled',
    'matEnabled',
  ]) {
    if (typeof data.config[key] !== 'boolean') throw new Error('Presencia de elementos inválida');
  }
  const config = sanitize(data.config),
    input = data.setup;
  if (
    !input ||
    ![...steps.map((s) => s.id), 'complete'].includes(input.step) ||
    !Number.isInteger(input.furthest) ||
    input.furthest < 0 ||
    input.furthest > 4 ||
    !Array.isArray(input.deferred) ||
    input.deferred.some((s) => !steps.some((step) => step.id === s))
  )
    throw new Error('Progreso inválido');
  const index = steps.findIndex((s) => s.id === input.step);
  if (index > input.furthest || (!['room', 'complete'].includes(input.step) && !config.roomEnabled))
    throw new Error('Habitación pendiente');
  return {
    config,
    setup: {
      step: input.step,
      furthest: input.furthest,
      deferred: [...new Set(input.deferred)],
      drafts: readDrafts(input.drafts),
    },
  };
}
export function projectData(config, setup) {
  return { app: 'Cockpit Lab', version: 2, units: 'cm', config, setup };
}
export function advanceSetup(setup, { defer = false } = {}) {
  const index = steps.findIndex((s) => s.id === setup.step);
  if (index < 0) return setup;
  const deferred = setup.deferred.filter((s) => s !== setup.step);
  if (defer) deferred.push(setup.step);
  return {
    step: steps[index + 1]?.id || 'complete',
    furthest: Math.max(setup.furthest, Math.min(4, index + 1)),
    deferred,
  };
}
