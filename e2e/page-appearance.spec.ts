// The whole page, panels included, in both color themes, compared with local references (not
// committed). The viewport tests in rendering.spec.ts only cover the 3D view.
import { test, expect, openApp, importProject } from './support.ts';
import type { Page } from '@playwright/test';

/**
 * Waits for the toast to go, since it shows for a fixed time, and keeps the pointer from
 * leaving a hover state on the last button clicked.
 */
async function expectPage(page: Page, name: string) {
  await expect(page.locator('#toast')).not.toHaveClass(/visible/, { timeout: 5000 });
  await page.mouse.move(0, 0);
  await expect(page).toHaveScreenshot(name, { fullPage: true });
}

/** The theme follows the system scheme that each run emulates. */
const THEMES = { light: '', dark: 'dark-' } as const;

for (const [colorScheme, prefix] of Object.entries(THEMES)) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme: colorScheme === 'dark' ? 'dark' : 'light' });

    test.describe('wide screen', () => {
      test('guided setup', async ({ page }) => {
        await openApp(page);
        await expectPage(page, `${prefix}guided-room.png`);
        await page.locator('#setupRoomW').fill('340');
        await page.locator('#setupRoomD').fill('320');
        await page.locator('#setupNext').click();
        await page.locator('[data-add-room="door"]').click();
        await expectPage(page, `${prefix}guided-openings.png`);
      });

      test('editor sections', async ({ page }) => {
        await openApp(page);
        await importProject(page, 'gt-room.json');
        for (const section of ['room', 'furniture', 'desk', 'rig']) {
          await page.locator(`#tab-${section}`).click();
          await expectPage(page, `${prefix}editor-${section}.png`);
        }
      });

      test('layout mode and warnings', async ({ page }) => {
        await openApp(page);
        await importProject(page, 'flight-lifted.json');
        await page.locator('#layoutBtn').click();
        await expectPage(page, `${prefix}layout-mode.png`);
      });

      test('summary dialog', async ({ page }) => {
        await openApp(page);
        await importProject(page, 'gt-room.json');
        await page.locator('#openSummary').click();
        await expect(page.locator('#summaryDialog')).toBeVisible();
        await expectPage(page, `${prefix}summary.png`);
      });
    });

    test.describe('phone', () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test('studio panels', async ({ page }) => {
        await openApp(page);
        await importProject(page, 'gt-room.json');
        for (const workspace of ['view', 'config', 'checks']) {
          await page.locator(`.studio-nav [data-workspace="${workspace}"]`).click();
          await expectPage(page, `${prefix}phone-${workspace}.png`);
        }
      });
    });
  });
}
