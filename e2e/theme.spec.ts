import { test, expect, openApp, importProject } from './support.ts';

const theme = (page: import('@playwright/test').Page) =>
  page.locator('html').getAttribute('data-theme');

test.describe('with a dark system', () => {
  test.use({ colorScheme: 'dark' });

  test('the theme follows the system until the user chooses', async ({ page }) => {
    await openApp(page);
    expect(await theme(page)).toBe('dark');
    await expect(page.locator('#themeBtn')).toHaveAttribute('aria-label', 'Color theme: System');
  });

  test('the 3D view is dark', async ({ page }) => {
    await openApp(page);
    await importProject(page, 'gt-room.json');
    await page.locator('[data-view="top"]').click();
    await expect(page.locator('#viewport')).toHaveScreenshot('dark-gt-room-top.png');
  });
});

test('switching to dark repaints the open 3D view as a dark start would', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  await page.locator('[data-view="top"]').click();
  await page.locator('#themeBtn').click();
  await page.locator('#themeBtn').click();
  expect(await theme(page)).toBe('dark');
  await expect(page.locator('#viewport')).toHaveScreenshot('dark-gt-room-top.png');
});

test('the theme button cycles through system, light and dark, and remembers it', async ({
  page,
}) => {
  await openApp(page);
  const button = page.locator('#themeBtn');
  expect(await theme(page)).toBe('light');

  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Color theme: Light');
  expect(await theme(page)).toBe('light');

  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Color theme: Dark');
  expect(await theme(page)).toBe('dark');

  await page.reload();
  await expect(button).toHaveAttribute('aria-label', 'Color theme: Dark');
  expect(await theme(page)).toBe('dark');

  await button.click();
  await expect(button).toHaveAttribute('aria-label', 'Color theme: System');
  expect(await theme(page)).toBe('light');
});

test('the theme preference is not part of the design', async ({ page }) => {
  await openApp(page);
  await page.locator('#themeBtn').click();
  const saved = await page.evaluate(() => Object.keys(localStorage));
  expect(saved).toContain('cockpit-lab-theme');
  const project = await page.evaluate(() => localStorage.getItem('cockpit-lab-v2') ?? '');
  expect(project).not.toContain('theme');
});

test.describe('printing from the dark theme', () => {
  test.use({ colorScheme: 'dark' });

  test('uses the light colors', async ({ page }) => {
    await openApp(page);
    const text = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),
      );
    const darkText = await text();
    await page.emulateMedia({ media: 'print' });
    const printText = await text();
    expect(printText).not.toBe(darkText);
    // Following the system, the page turns light when the system does.
    await page.emulateMedia({ colorScheme: 'light', media: 'screen' });
    await expect.poll(text).toBe(printText);
  });
});
