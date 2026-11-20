// The checks a CAD cockpit design gets on its own: interference between its parts, the parts
// that nothing supports, the joints still without connectors, the steps of its history that
// failed and, once a part slides, what meets at the ends of its travels and the spans its
// adjustments would stretch or squeeze, and, once it has a plate, what is wrong with the holes of
// its plates for how they are made. Each is one check that lists what it found, so a design
// with many problems still reads at a glance. In a design with modes, what depends on the parts
// on the cockpit, as interference, support and the driver's reach, is checked in the mode shown,
// and the other modes say how many problems they have; the rest belongs to the whole design.
import type { Check } from '../shared/checks.ts';
import { round } from '../shared/geometry.ts';
import type { Axis, ResolvedPart } from './cad/parts/assembly.ts';
import type { PlacedConnector } from './cad/parts/connectors.ts';
import { cockpitInterferences, type CadInterference } from './cad/analysis/interference.ts';
import { jointsOf, type Joint } from './cad/parts/joints.ts';
import { adjustmentOf, stepTitle, type Operation } from './cad/history/operations.ts';
import { unsupportedParts } from './cad/analysis/support.ts';
import { travelInterferences, type FittedPose } from './cad/history/travel.ts';
import {
  plateHoleProblems,
  type HoleProblem,
  type HoleProblemKind,
} from './cad/analysis/hole-problems.ts';
import type { SlidingPart } from './cad/parts/plate-holes.ts';
import {
  appliedSubassemblies,
  spansReachingSubassemblies,
  type Subassembly,
} from './cad/history/subassemblies.ts';
import { designInMode, partsOffIn, type Mode } from './cad/history/modes.ts';
import { historyInMode } from './cad/history/mode-positions.ts';
import { replayDesign } from './cad/history/replay.ts';
import { seatedDriver, type Driver } from './cad/driver/driver.ts';

/** A design replayed from its history, with the steps that failed. */
export interface DesignToCheck {
  history: readonly Operation[];
  resolved: ReadonlyMap<string, ResolvedPart>;
  failures: ReadonlyMap<string, string>;
  /** The connectors on its joints; none when left out. */
  connectors?: readonly PlacedConnector[];
  /** Its joints; when left out, those its attachments and spans make. */
  joints?: readonly Joint[];
  /** The design as fitted; when left out, every part is at the center of its travel. */
  fitted?: FittedPose;
  /** The adjustment of each part that has one, by its id; none when left out. */
  adjustments?: ReadonlyMap<string, SlidingPart>;
  /** Its subassemblies; none when left out. */
  subassemblies?: readonly Subassembly[];
  /** The driver it is fitted to; its reach is not checked when left out. */
  driver?: Driver;
}

/** A design as stored, with what it keeps beside its history. */
export interface DesignInModes {
  /** The history as stored, with the positions of the first mode. */
  history: readonly Operation[];
  subassemblies: readonly Subassembly[];
  modes: readonly Mode[];
  /** The mode the view shows, or null for all the parts. */
  shownModeId: string | null;
  driver?: Driver;
}

/** The checks that depend on which parts are on the cockpit. */
interface PartsOnChecks {
  interference: Check;
  support: Check;
  alongTravels: Check[];
  driver: Check[];
}

/** The shortest way out, in the frame of the part it was measured on. */
const WAY_OUT_TEXT: Record<Axis, string> = {
  x: 'sideways',
  y: 'up or down',
  z: 'front to back',
};

/** The ends of a travel along each axis: +Z is the front, and −X is the pilot's right. */
const TRAVEL_END_TEXT: Record<Axis, { towardsPlus: string; towardsMinus: string }> = {
  x: { towardsPlus: 'left', towardsMinus: 'right' },
  y: { towardsPlus: 'top', towardsMinus: 'bottom' },
  z: { towardsPlus: 'front', towardsMinus: 'back' },
};

const countText = (count: number): string => (count ? String(count) : 'None');

/** One check that warns when it finds anything, and lists what it found. */
function listCheck(
  id: string,
  label: string,
  items: string[],
  detail: { found: string; none: string },
): Check {
  return {
    id,
    label,
    value: countText(items.length),
    level: items.length ? 'warning' : 'ok',
    detail: items.length ? detail.found : detail.none,
    items,
  };
}

/**
 * The checks of a design in the mode the view shows. Without modes every part is on; with all
 * the parts shown, only the checks of the whole design apply, and each mode says how many
 * problems it has.
 */
export function designChecks(design: DesignInModes): Check[] {
  const { history, subassemblies, modes, driver } = design;
  const replayed = replayDesign(history);
  const whole: DesignToCheck = {
    history,
    ...replayed,
    subassemblies,
    ...(driver ? { driver } : {}),
  };
  if (modes.length === 0) return cadChecks(whole);
  const applied = appliedSubassemblies(subassemblies, replayed.resolved);
  // Each mode is checked with its parts where it fits them, and only those it has on.
  const inMode = (mode: Mode): DesignToCheck => {
    const fitted = historyInMode(history, modes, mode.id);
    return {
      ...whole,
      history: fitted,
      ...designInMode(replayDesign(fitted), partsOffIn(mode, applied)),
    };
  };
  const shown = modes.find((mode) => mode.id === design.shownModeId) ?? null;
  const others = modes.filter((mode) => mode !== shown);
  const checks = cadChecks(whole, { onCockpit: shown ? inMode(shown) : null });
  if (others.length === 0) return checks;
  const problems = others.map((mode) => ({
    name: mode.name,
    checks: allOf(partsOnChecks(inMode(mode))),
  }));
  return [...checks, modesCheck(problems, shown !== null)];
}

/**
 * The checks of a design. Those that depend on which parts are on the cockpit are of
 * `onCockpit`, the design itself unless given, and left out when it is null.
 */
export function cadChecks(
  design: DesignToCheck,
  { onCockpit = design }: { onCockpit?: DesignToCheck | null } = {},
): Check[] {
  const on = onCockpit ? partsOnChecks(onCockpit) : null;
  return [
    ...(on ? [on.interference, on.support] : []),
    pendingJointsCheck(
      design.resolved,
      design.joints ?? jointsOf(design.resolved),
      design.connectors ?? [],
    ),
    failedStepsCheck(design),
    ...(on?.alongTravels ?? []),
    ...plateHoleChecks(design),
    ...subassemblyChecks(design),
    ...(on?.driver ?? []),
  ];
}

function partsOnChecks(design: DesignToCheck): PartsOnChecks {
  // Parts reach into each other where the driver has them, along their travels.
  const shown = design.fitted ?? design;
  const adjusted = design.history.some((operation) => adjustmentOf(operation) !== undefined);
  return {
    interference: interferenceCheck(shown.resolved, shown.connectors ?? []),
    support: supportCheck(design.resolved, design.joints ?? jointsOf(design.resolved)),
    alongTravels: adjusted ? [travelInterferenceCheck(design), fittedSpansCheck(design)] : [],
    driver: driverReachCheck(design),
  };
}

const allOf = (checks: PartsOnChecks): Check[] => [
  checks.interference,
  checks.support,
  ...checks.alongTravels,
  ...checks.driver,
];

const itemCount = (check: Check): number => check.items?.length ?? 0;

/** How many problems each mode has, and in which checks, for the modes not shown. */
function modesCheck(modes: { name: string; checks: Check[] }[], aModeIsShown: boolean): Check {
  const items = modes.flatMap(({ name, checks }) => {
    const warned = checks.filter((check) => itemCount(check) > 0);
    const total = warned.reduce((sum, check) => sum + itemCount(check), 0);
    if (total === 0) return [];
    const where = warned.map((check) => `${check.label}: ${itemCount(check)}`);
    return [`${name}: ${total} ${total === 1 ? 'problem' : 'problems'} — ${where.join(', ')}`];
  });
  return listCheck(
    'cad-modes',
    aModeIsShown ? 'Problems in other modes' : 'Problems in the modes',
    items,
    {
      found: 'Show a mode in the view to see its problems and the parts it has on.',
      none: aModeIsShown
        ? 'The other modes have no problems with the parts they have on.'
        : 'No mode has problems with the parts it has on.',
    },
  );
}

/** Once the driver sits in the design, what the legs, the arms and the hands do not reach. */
function driverReachCheck({ resolved, fitted, driver }: DesignToCheck): Check[] {
  if (!driver) return [];
  const seated = seatedDriver((fitted ?? { resolved }).resolved, driver);
  if (seated.kind !== 'seated') return [];
  const { legs, arms, grips } = seated.reach;
  const items = [
    ...(legs ? [] : ['The legs do not reach the pedals']),
    ...(arms === false ? ['The arms do not reach the wheel'] : []),
    ...grips
      .filter(({ shortByMm }) => shortByMm > 0)
      // Rounded up, so a grip just out of reach never reads as 0 mm beyond it.
      .map(
        ({ name, hand, shortByMm }) =>
          `${name}: ${Math.ceil(shortByMm)} mm beyond the reach of the ${hand} hand`,
      ),
    ...seated.doubledGrips.map(
      ({ hand, names }) =>
        `The ${hand} hand has more than one grip to hold, ${names.join(', ')}, and holds neither`,
    ),
  ];
  return [
    listCheck('cad-driver-reach', "Driver's reach", items, {
      found: 'Move the peripherals along their travels in Fit, or mount them closer to the driver.',
      none: 'The driver reaches the pedals and whatever the hands hold.',
    }),
  ];
}

/** Once the design has a subassembly, the parts outside one that depend on it. */
function subassemblyChecks({ resolved, subassemblies = [] }: DesignToCheck): Check[] {
  if (subassemblies.length === 0) return [];
  const applied = appliedSubassemblies(subassemblies, resolved);
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const subassemblyName = (rootId: string) =>
    applied.find((subassembly) => subassembly.rootId === rootId)?.name ?? rootId;
  const items = spansReachingSubassemblies(applied, resolved).map(
    ({ spanId, reachesId, rootId }) =>
      `${nameOf(spanId)} reaches ${nameOf(reachesId)}, in ${subassemblyName(rootId)}`,
  );
  return [
    listCheck('cad-subassembly-dependents', 'Parts depending on a subassembly', items, {
      found:
        'Taking the subassembly off would leave each of these spans with an open end. Grow the span out of a part of the subassembly, or have it reach a part outside.',
      none: 'No part outside a subassembly depends on one.',
    }),
  ];
}

/** What each check of plate holes is called and says, by the kind of problem it lists. */
const HOLE_CHECKS: Record<
  HoleProblemKind,
  { id: string; label: string; found: string; none: string }
> = {
  'off-plate': {
    id: 'cad-holes-off-plate',
    label: 'Holes off their plate',
    found:
      'A hole must lie wholly within its plate. Move what puts it there, or make the plate larger.',
    none: 'Every hole lies within its plate.',
  },
  'near-edge': {
    id: 'cad-holes-near-edge',
    label: 'Holes too close to an edge',
    found:
      'Each plate’s process wants this much material between a hole and the edge. Move what puts the hole there, or make the plate larger.',
    none: 'Every hole leaves its plate’s process enough material to the edge.',
  },
  'near-hole': {
    id: 'cad-holes-near-holes',
    label: 'Holes too close together',
    found:
      'Each plate’s process wants this much material between two holes. Move a peripheral, or change the bolts of a joint.',
    none: 'No two holes come closer than their plate’s process wants.',
  },
  'uncut-slot': {
    id: 'cad-uncut-slots',
    label: 'Slots the process cannot cut',
    found: 'Have the plate laser or water-jet cut, or run the peripheral on its own rails.',
    none: 'Every slot is on a plate whose process cuts slots.',
  },
  'over-profile': {
    id: 'cad-holes-over-profiles',
    label: 'Holes over a profile',
    found:
      'A bolt through such a hole meets the profile, with no room for its nut. Move the peripheral until the hole is off the profile or over one of its slots, where it takes a T-nut.',
    none: 'Every mounting hole over a profile is over one of its slots.',
  },
};

const HOLE_PROBLEM_KINDS: readonly HoleProblemKind[] = [
  'off-plate',
  'near-edge',
  'near-hole',
  'uncut-slot',
  'over-profile',
];

/** The five checks of the holes of the design's plates, once it has a plate. */
function plateHoleChecks(design: DesignToCheck): Check[] {
  const plates = [...design.resolved.values()].filter(({ part }) => part.kind === 'plate');
  if (plates.length === 0) return [];
  const sources = {
    resolved: design.resolved,
    joints: design.joints ?? jointsOf(design.resolved),
    connectors: design.connectors ?? [],
    adjustments: design.adjustments ?? new Map<string, SlidingPart>(),
  };
  const found: { plateName: string; problem: HoleProblem }[] = plates.flatMap(({ part }) =>
    plateHoleProblems(sources, part.id).map((problem) => ({ plateName: part.name, problem })),
  );
  return HOLE_PROBLEM_KINDS.map((kind) => {
    const { id, label, found: foundText, none } = HOLE_CHECKS[kind];
    const items = found
      .filter(({ problem }) => problem.kind === kind)
      .map(({ plateName, problem }) => `${plateName}: ${problem.text}`);
    return listCheck(id, label, items, { found: foundText, none });
  });
}

/** The parts that would reach into each other with one adjusted part at an end of its travel. */
function travelInterferenceCheck({ history, resolved, connectors = [] }: DesignToCheck): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const items = travelInterferences(history, resolved, connectors).map(
    ({ movedId, endMm, axis, interference }) => {
      const ends = TRAVEL_END_TEXT[axis];
      const end = endMm > 0 ? ends.towardsPlus : ends.towardsMinus;
      return `${interferenceText(interference)}, with ${nameOf(movedId)} at the ${end} end of its travel`;
    },
  );
  return listCheck('cad-travel-interference', 'Parts meeting along a travel', items, {
    found:
      'Each travel is checked at both ends, with the other parts where they are. Shorten the travel, or move one part of each pair.',
    none: 'No part reaches into another at either end of its travel.',
  });
}

/** The spans that would no longer meet their part with the adjusted parts where they are. */
function fittedSpansCheck({ resolved, fitted }: DesignToCheck): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const items = (fitted?.changedSpans ?? []).map(({ partId, reachesId, changeMm }) => {
    const way = changeMm > 0 ? 'longer' : 'shorter';
    return `${nameOf(partId)} would have to be ${round(Math.abs(changeMm), 1)} mm ${way} to meet ${nameOf(reachesId)}`;
  });
  return listCheck('cad-fitted-spans', 'Spans the adjustments move', items, {
    found:
      'A span is cut to its length, so the part it reaches no longer meets it as fitted. Move the parts back along their travels, or adjust a part the span does not depend on.',
    none: 'No adjustment moves a span away from the part it reaches.',
  });
}

function interferenceCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  connectors: readonly PlacedConnector[],
): Check {
  const items = cockpitInterferences(resolved, connectors).map(interferenceText);
  return listCheck('cad-interference', 'Parts reaching into each other', items, {
    found: 'Within the cockpit, deepest first. Move or shorten one part of each pair.',
    none: 'No part of the cockpit reaches into another.',
  });
}

const interferenceText = (found: CadInterference): string =>
  `${found.partName} into ${found.otherName}: ${round(found.depthMm, 1)} mm ${WAY_OUT_TEXT[found.axis]}`;

function supportCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
): Check {
  const items = unsupportedParts(resolved, joints).map((id) => resolved.get(id)?.part.name ?? id);
  const hasFeet = [...resolved.values()].some(({ part }) => part.kind === 'foot');
  return listCheck('cad-support', 'Unsupported parts', items, {
    found: hasFeet
      ? 'No joint connects them, through other parts, to a part on feet.'
      : 'The design has no feet yet: nothing in it stands on the floor.',
    none: 'Every part is joined, through others, to a part on feet.',
  });
}

function pendingJointsCheck(
  resolved: ReadonlyMap<string, ResolvedPart>,
  joints: readonly Joint[],
  connectors: readonly PlacedConnector[],
): Check {
  const nameOf = (id: string) => resolved.get(id)?.part.name ?? id;
  const fastened = new Set(connectors.map((connector) => connector.jointId));
  const items = joints
    .filter((joint) => !fastened.has(joint.id))
    .map((joint) => `${nameOf(joint.partId)} to ${nameOf(joint.toPartId)}`);
  return listCheck('cad-pending-joints', 'Joints without connectors', items, {
    found:
      'Their connectors, bolts and T-nuts are not in the parts to buy yet. Fasten them from the inspector of a part.',
    none: 'Every joint has its connectors.',
  });
}

function failedStepsCheck({ history, failures }: DesignToCheck): Check {
  const items = history.flatMap((operation, index) => {
    const failure = failures.get(operation.id);
    return failure === undefined
      ? []
      : [`Step ${index + 1}, ${stepTitle(history, operation)}: ${failure}`];
  });
  return listCheck('cad-failed-steps', 'Failed steps', items, {
    found: 'They add nothing to the design. Fix or delete them in the design history.',
    none: 'Every step of the design history applies.',
  });
}
