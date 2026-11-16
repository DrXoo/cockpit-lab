// Characterization of what the app renders, compared with local references (not committed).
// Run `npx playwright test --update-snapshots` to accept an intended change.
import {
  test,
  expect,
  openApp,
  importProject,
  cockpitFileOf,
  sampleFrameHistory,
  SCREENSHOT_TIMEOUT_MS,
} from './support.ts';

const SCREENSHOT = { timeout: SCREENSHOT_TIMEOUT_MS };

const FIXTURES = ['gt-room.json', 'flight-lifted.json', 'desk-only.json'];
const VIEWS = ['iso', 'top', 'desk'];
const SECTIONS = ['room', 'furniture', 'desk'];

const nameOf = (fixture: string) => fixture.replace('.json', '');

for (const fixture of FIXTURES) {
  test.describe(nameOf(fixture), () => {
    test.beforeEach(async ({ page }) => {
      await openApp(page);
      await importProject(page, fixture);
    });

    for (const view of VIEWS)
      test(`${view} view`, async ({ page }) => {
        await page.locator(`[data-view="${view}"]`).click();
        await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('#viewport')).toHaveScreenshot(
          `${nameOf(fixture)}-${view}.png`,
          SCREENSHOT,
        );
      });

    test('settings panels', async ({ page }) => {
      for (const section of SECTIONS) {
        await page.locator(`#tab-${section}`).click();
        expect(await page.locator('#controls').innerText()).toMatchSnapshot(
          `${nameOf(fixture)}-controls-${section}.txt`,
        );
      }
    });

    test('checks and metrics', async ({ page }) => {
      expect(await page.locator('#inspector').innerText()).toMatchSnapshot(
        `${nameOf(fixture)}-inspector.txt`,
      );
      expect(await page.locator('.metrics, #metricFootprint').first().innerText()).toMatchSnapshot(
        `${nameOf(fixture)}-metrics.txt`,
      );
    });

    test('summary', async ({ page }) => {
      await page.locator('#openSummary').click();
      await expect(page.locator('#summaryDialog')).toBeVisible();
      expect(await page.locator('#summaryContent').innerText()).toMatchSnapshot(
        `${nameOf(fixture)}-summary.txt`,
      );
    });
  });
}

test('the dimensions toggle', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('[data-view="top"]').click();
  await page.locator('#dimensionBtn').click();
  await expect(page.locator('#viewport')).toHaveScreenshot(
    'gt-room-top-no-dimensions.png',
    SCREENSHOT,
  );
});

test.describe('cockpit design', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page);
    await page.locator('#startWithCockpit').click();
    await page.locator('#importCockpitFile').setInputFiles(cockpitFileOf(sampleFrameHistory()));
    await expect(page.locator('[data-part]')).toHaveCount(5);
    await page.locator('[data-part="part-4"]').click();
  });

  for (const view of ['iso', 'top', 'side'])
    test(`${view} view`, async ({ page }) => {
      await page.locator(`[data-view="${view}"]`).click();
      await expect(page.locator(`[data-view="${view}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#viewport')).toHaveScreenshot(
        `cockpit-design-${view}.png`,
        SCREENSHOT,
      );
    });

  test('history and inspector', async ({ page }) => {
    expect(await page.locator('#controls').innerText()).toMatchSnapshot(
      'cockpit-design-history.txt',
    );
    expect(await page.locator('#inspector').innerText()).toMatchSnapshot(
      'cockpit-design-inspector.txt',
    );
  });
});
