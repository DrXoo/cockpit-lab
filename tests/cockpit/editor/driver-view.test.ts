import test from 'node:test';
import assert from 'node:assert/strict';
import { driverHTML } from '../../../src/cockpit/editor/driver-view.ts';
import type { SeatedDriver } from '../../../src/cockpit/cad/driver/driver.ts';

type Seated = Extract<SeatedDriver, { kind: 'seated' }>;

const DRIVER = { statureMm: 1820 };
const point = (y: number) => ({ x: 0, y, z: 0 });
const seated = (changes: Partial<Seated> = {}): Seated => ({
  kind: 'seated',
  figure: {
    hip: point(300),
    knee: point(400),
    heel: point(100),
    shoulder: point(800),
    eye: point(1012.4),
    arms: [{ shoulder: point(800), elbow: point(700), hand: point(650) }],
  },
  angles: [
    { joint: 'knee', angleDeg: 125.4, range: { minDeg: 110, maxDeg: 140 }, verdict: 'within' },
    { joint: 'hip', angleDeg: 90.2, range: { minDeg: 95, maxDeg: 120 }, verdict: 'below' },
    { joint: 'elbow', angleDeg: 150, range: { minDeg: 90, maxDeg: 130 }, verdict: 'above' },
  ],
  reach: { legs: true, arms: true, grips: [] },
  doubledGrips: [],
  ...changes,
});
const angleItems = (html: string) => [
  ...html.matchAll(/<li data-angle="(\w+)"[^>]*>([^<]*)<\/li>/g),
];

test('the stature is typed in cm', () => {
  const html = driverHTML(DRIVER, seated());
  assert.match(html, /id="driverStature"[^>]*value="182"/);
  assert.match(html, /min="140" max="210"/);
});

test('each angle shows its value and range, marked with a symbol as well as a class', () => {
  const items = angleItems(driverHTML(DRIVER, seated())).map(([, joint, text]) => [joint, text]);
  assert.deepEqual(items, [
    ['knee', '✓ Knee 125°, within 110–140°'],
    ['hip', '⚠ Hip 90°, tighter than 95–120°'],
    ['elbow', '⚠ Elbow 150°, more open than 90–130°'],
  ]);
  assert.match(driverHTML(DRIVER, seated()), /data-angle="hip" class="driver-angle warning"/);
});

test('the eye point is given as its height above the floor', () => {
  assert.match(driverHTML(DRIVER, seated()), /Eye point 1012 mm above the floor/);
});

test('legs or arms that do not reach are warned about', () => {
  const html = driverHTML(DRIVER, seated({ reach: { legs: false, arms: false, grips: [] } }));
  assert.match(html, /⚠ The legs do not reach the pedals\./);
  assert.match(html, /⚠ The arms do not reach the wheel\./);
  const reaching = driverHTML(DRIVER, seated());
  assert.doesNotMatch(reaching, /do not reach/);
});

test('a design that seats no driver says why, and keeps the stature', () => {
  const html = driverHTML(DRIVER, { kind: 'unseated', reason: 'Mount a seat.' });
  assert.match(html, /id="driverUnseated"[^>]*>Mount a seat\.</);
  assert.match(html, /id="driverStature"/);
  assert.equal(angleItems(html).length, 0);
});

test('an elbow on a grip is named by its hand', () => {
  const html = driverHTML(
    DRIVER,
    seated({
      angles: [
        {
          joint: 'elbow',
          hand: 'right',
          angleDeg: 110,
          range: { minDeg: 90, maxDeg: 130 },
          verdict: 'within',
        },
      ],
    }),
  );
  assert.match(html, /<li data-angle="elbow" data-hand="right"[^>]*>✓ Right elbow 110°, within/);
});

test('each grip says whether its hand is on it or reaches it, and by how much it does not', () => {
  const grip = (partId: string, held: boolean, shortByMm: number) => ({
    partId,
    name: `<${partId}>`,
    hand: 'right' as const,
    held,
    shortByMm,
  });
  const html = driverHTML(
    DRIVER,
    seated({
      reach: {
        legs: true,
        arms: null,
        grips: [
          grip('stick', true, 0),
          grip('far-stick', true, 44.2),
          grip('shifter', false, 0),
          grip('handbrake', false, 0.3),
        ],
      },
    }),
  );
  const items = [...html.matchAll(/<li data-grip="([\w-]+)" class="([\w -]+)">([^<]*)<\/li>/g)];
  assert.deepEqual(
    items.map(([, partId, classes, text]) => [partId, classes, text]),
    [
      ['stick', 'driver-angle ok', '✓ Right hand on &lt;stick&gt;'],
      [
        'far-stick',
        'driver-angle warning',
        '⚠ Right hand on &lt;far-stick&gt;, 45 mm beyond its reach',
      ],
      ['shifter', 'driver-angle ok', '✓ &lt;shifter&gt; within reach of the right hand'],
      [
        'handbrake',
        'driver-angle warning',
        '⚠ &lt;handbrake&gt; 1 mm beyond reach of the right hand',
      ],
    ],
  );
});

test('a hand with two sticks or throttles is warned about', () => {
  const html = driverHTML(
    DRIVER,
    seated({ doubledGrips: [{ hand: 'left', names: ['Throttle', 'Stick'] }] }),
  );
  assert.match(
    html,
    /data-doubled="left"[^>]*>⚠ The left hand has more than one grip to hold, Throttle and Stick, and holds neither\.</,
  );
});
