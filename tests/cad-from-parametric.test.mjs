import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { designFromBase, designOnItsOwn } from '../src/cockpit-design.ts';
import { getParts } from '../src/parts.ts';
import { readProject } from '../src/project.ts';
import { cornersMm, resolveAssembly } from '../src/cad/assembly.ts';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { drawRig } from '../src/render-rig.ts';
import { evaluate } from '../src/model.ts';
import { cutList } from '../src/cad/cuts.ts';
import { partsFromParametric } from '../src/cad/from-parametric.ts';

const fixtureDesign = (name) => {
  const data = JSON.parse(readFileSync(new URL(`../e2e/fixtures/${name}.json`, import.meta.url)));
  return readProject(data).cockpit;
};

const designs = {
  'GT base': designFromBase('gt'),
  'flight base': designFromBase('flight'),
  'hybrid base': designFromBase('hybrid'),
  'small base': designFromBase('small'),
  'gt-room fixture': fixtureDesign('gt-room'),
  'flight-lifted fixture': fixtureDesign('flight-lifted'),
  'legacy-v1 fixture': fixtureDesign('legacy-v1'),
  'everything on, driving on the left': {
    ...designFromBase('hybrid'),
    wheel: true,
    hotas: true,
    centerStick: true,
    shifter: true,
    handbrake: true,
    drivingSide: 'left',
    baseLift: 8,
  },
  'nothing but the frame': {
    ...designFromBase('gt'),
    wheel: false,
    hotas: false,
    centerStick: false,
    shifter: false,
    handbrake: false,
    baseLift: 0,
  },
};

/** Pieces per section and length, which is what has to be bought and cut. */
const countBySectionAndLength = (rows) => {
  const counts = {};
  for (const { sectionId, lengthMm, quantity } of rows) {
    const key = `${sectionId} at ${lengthMm} mm`;
    counts[key] = (counts[key] ?? 0) + quantity;
  }
  return counts;
};

const parametricCuts = (design) =>
  countBySectionAndLength(
    getParts(designOnItsOwn(design)).parts.map((row) => ({
      sectionId: row.profile.replace(' × ', 'x'),
      lengthMm: row.mm,
      quantity: row.qty,
    })),
  );

const cadCuts = (design) =>
  countBySectionAndLength(cutList(resolveAssembly(partsFromParametric(design))));

for (const [name, design] of Object.entries(designs)) {
  test(`the ${name} converts to the same profile lengths and counts as its cut list`, () => {
    assert.ok(design, `${name} has a cockpit design`);
    assert.deepEqual(cadCuts(design), parametricCuts(design));
  });
}

test('every converted part has its own id and a name', () => {
  for (const design of Object.values(designs)) {
    const parts = partsFromParametric(design);
    assert.equal(new Set(parts.map((part) => part.id)).size, parts.length);
    for (const part of parts) assert.ok(part.name.length > 0, part.id);
  }
});

test('the base crossmembers span the side rails, and the extensions hang under them', () => {
  const design = { ...designFromBase('gt'), baseLift: 10 };
  const parts = partsFromParametric(design);
  const crossmembers = parts.filter((part) => part.id.startsWith('base-crossmember-'));
  assert.equal(crossmembers.length, 3);
  for (const part of crossmembers) assert.equal(part.placement.kind, 'span');
  const extensions = parts.filter((part) => part.id.startsWith('base-extension-'));
  assert.equal(extensions.length, 4);
  for (const part of extensions) {
    assert.equal(part.placement.kind, 'attachment');
    assert.equal(part.placement.face, '-y');
  }
  const resolved = resolveAssembly(parts);
  for (const part of extensions) assert.equal(resolved.get(part.id).box.min.y, 60);
});

test('the pedal deck profiles are locked at the deck tilt', () => {
  const design = designFromBase('gt');
  const deck = partsFromParametric(design).filter((part) => part.id.startsWith('pedal-deck-'));
  assert.equal(deck.length, 4);
  for (const part of deck) assert.equal(part.placement.tiltDeg, design.pedalTilt);
});

test('the profiles convert to where the parametric drawing puts them', () => {
  const design = { ...designFromBase('gt'), width: 60, length: 140, baseLift: 0 };
  const resolved = resolveAssembly(partsFromParametric(design));
  assert.deepEqual(resolved.get('base-rail-right').box, {
    min: { x: -300, y: 60, z: 0 },
    max: { x: -260, y: 140, z: 1400 },
  });
  const wheelUpright = resolved.get('wheel-upright-left').box;
  assert.equal(wheelUpright.min.y, 140);
  assert.equal(wheelUpright.max.x - wheelUpright.min.x, 80);
});

/** Rounds to 0.1 mm, so floating point noise does not tell boxes apart. */
const round = (value) => Math.round(value * 10) / 10 + 0;

/** The bounding range of points, as one comparable string. */
const rangeOf = (points) => {
  const axis = (key) => {
    const values = points.map((point) => round(point[key]));
    return `${Math.min(...values)}..${Math.max(...values)}`;
  };
  return `x ${axis('x')}, y ${axis('y')}, z ${axis('z')}`;
};

/** Turns a point about X as Three.js does for a rotation of `angle` radians. */
const turnAboutX = ([x, y, z], angle) => [
  x,
  y * Math.cos(angle) - z * Math.sin(angle),
  y * Math.sin(angle) + z * Math.cos(angle),
];

/** World corners in mm of the profiles the parametric drawing puts in the scene. */
const drawnProfileRanges = (design) => {
  const r = createRenderList();
  const config = designOnItsOwn(design);
  drawRig(r, ROOT, config, evaluate(config), { person: false });
  const byId = new Map(r.primitives.filter((p) => 'id' in p).map((p) => [p.id, p]));
  const toCockpit = (point, parentId) => {
    let current = point;
    for (let id = parentId; id !== ROOT; id = byId.get(id).parent) {
      const { position, rotation } = byId.get(id);
      assert.equal(rotation[1], 0);
      assert.equal(rotation[2], 0);
      const [x, y, z] = turnAboutX(current, rotation[0]);
      current = [x + position[0], y + position[1], z + position[2]];
    }
    return { x: current[0] * 10, y: current[1] * 10, z: current[2] * 10 };
  };
  const isProfileSide = (size) => size === 4 || size === 8;
  const profiles = r.primitives.filter(
    (p) => p.kind === 'box' && p.material === 'silver' && p.size.filter(isProfileSide).length >= 2,
  );
  return profiles.map((box) => {
    assert.deepEqual(box.rotation, [0, 0, 0]);
    const corners = [];
    for (const dx of [-0.5, 0.5])
      for (const dy of [-0.5, 0.5])
        for (const dz of [-0.5, 0.5]) {
          const local = [
            box.position[0] + dx * box.size[0],
            box.position[1] + dy * box.size[1],
            box.position[2] + dz * box.size[2],
          ];
          corners.push(toCockpit(local, box.parent));
        }
    return rangeOf(corners);
  });
};

const convertedProfileRanges = (design) =>
  [...resolveAssembly(partsFromParametric(design)).values()].map((resolved) =>
    rangeOf(cornersMm(resolved)),
  );

for (const [name, design] of Object.entries(designs)) {
  test(`the ${name} converts every profile to where the parametric drawing puts it`, () => {
    assert.deepEqual(convertedProfileRanges(design).sort(), drawnProfileRanges(design).sort());
  });
}
