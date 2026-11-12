import { readFile } from 'node:fs/promises';
import { test, expect, openApp, STORAGE_KEY } from './support.ts';

const UNREADABLE = '{"app":"Cockpit Lab","version":4,"cockpit":';

test('a saved design that cannot be read is kept, offered for download and not overwritten', async ({
  page,
}) => {
  // Seeded before the app starts, once: a page that unloads saves its own project.
  await page.addInitScript(
    ([key, text]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(key, text);
      sessionStorage.setItem('seeded', 'yes');
    },
    [STORAGE_KEY, UNREADABLE],
  );
  await openApp(page);

  const dialog = page.locator('#unreadableDialog');
  await expect(dialog).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.locator('#downloadUnreadable').click(),
  ]);
  expect(await readFile(await download.path(), 'utf8')).toBe(UNREADABLE);
  await dialog.locator('[data-close="unreadableDialog"]').first().click();
  await expect(dialog).toBeHidden();

  // Leaving the page saves the new project; the unreadable text survives under its own key.
  await page.reload();
  const kept = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((key) => key.startsWith('cockpit-lab-unreadable-'))
      .map((key) => localStorage.getItem(key)),
  );
  expect(kept).toEqual([UNREADABLE]);
  await expect(page.locator('#unreadableDialog')).toBeHidden();
});
