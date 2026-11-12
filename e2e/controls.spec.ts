import type { Page } from '@playwright/test';
import { test, expect, openApp, importProject, getState } from './support.ts';

// Every control in every panel, used once. Any page error fails the test (see support.ts),
// so a control that sends the model something it rejects shows up here.

/** Runs `use` on each control matching `selector`, finding it again as the panel re-renders. */
async function eachControl(page: Page, selector: string, use: (index: number) => Promise<void>) {
  const count = await page.locator(`#controls ${selector}`).count();
  for (let index = 0; index < count; index++) {
    if ((await page.locator(`#controls ${selector}`).count()) <= index) break;
    await use(index);
  }
}

async function useEveryControl(page: Page) {
  await eachControl(page, 'select[data-key]', async (index) => {
    const select = page.locator('#controls select[data-key]').nth(index);
    const values = await select
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
    for (const value of values) {
      const current = page.locator('#controls select[data-key]').nth(index);
      if (await current.isVisible()) await current.selectOption(value);
    }
  });
  await eachControl(page, 'input[type=checkbox][data-key]', async (index) => {
    for (let flip = 0; flip < 2; flip++) {
      const box = page.locator('#controls input[type=checkbox][data-key]').nth(index);
      if (await box.isVisible()) await box.click();
    }
  });
  await eachControl(page, 'input[data-number]', async (index) => {
    const field = page.locator('#controls input[data-number]').nth(index);
    if (!(await field.isVisible())) return;
    await field.fill(await field.inputValue());
    await field.press('Enter');
  });
  await eachControl(page, '[data-rotate]', async (index) => {
    const button = page.locator('#controls [data-rotate]').nth(index);
    if (await button.isVisible()) await button.click();
  });
}

for (const section of ['room', 'furniture', 'desk', 'cockpit']) {
  test(`every control in the ${section} panel can be used`, async ({ page }) => {
    await openApp(page);
    await importProject(page, 'flight-lifted.json');
    await page.locator(`#tab-${section}`).click();
    const before = await getState(page);
    await useEveryControl(page);
    // The panel is still there and the configuration is still valid.
    await expect(page.locator('#controls')).not.toBeEmpty();
    expect(Object.keys(await getState(page))).toEqual(Object.keys(before));
  });
}

for (const section of ['frame', 'posture']) {
  test(`every control in the ${section} panel of the cockpit design can be used`, async ({
    page,
  }) => {
    await openApp(page);
    await importProject(page, 'flight-lifted.json');
    await page.locator('#cockpitEditor').click();
    await page.locator(`#tab-${section}`).click();
    const before = await getState(page);
    await useEveryControl(page);
    await expect(page.locator('#controls')).not.toBeEmpty();
    expect(Object.keys(await getState(page))).toEqual(Object.keys(before));
  });
}
