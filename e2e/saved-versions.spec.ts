import { test, expect, openApp, readFixture, getState, getSavedProject } from './support.ts';
import { projectConfig, projectData, readProject } from '../src/project.ts';

const V3_STORAGE_KEY = 'cockpit-lab-v3';

/** The gt-room design as the previous version saved it: v3, the design among the shared settings. */
function savedByVersion3(): string {
  const current = projectData(readProject(readFixture('gt-room.json')));
  const { room, cockpit, ...file } = current;
  return JSON.stringify({
    ...file,
    ...room,
    version: 3,
    shared: { ...room.shared, ...cockpit, cockpitEnabled: cockpit !== null },
  });
}

test('a design saved by the previous version opens, and is saved anew without touching it', async ({
  page,
}) => {
  const saved = savedByVersion3();
  await page.addInitScript(
    ([key, text]) => {
      if (sessionStorage.getItem('seeded')) return;
      localStorage.setItem(key, text);
      sessionStorage.setItem('seeded', 'yes');
    },
    [V3_STORAGE_KEY, saved],
  );
  await openApp(page);
  expect(await getState(page)).toEqual(projectConfig(readProject(JSON.parse(saved))));

  await page.reload();
  expect((await getSavedProject(page)).version).toBe(4);
  expect(await getState(page)).toEqual(projectConfig(readProject(JSON.parse(saved))));
  expect(await page.evaluate((key) => localStorage.getItem(key), V3_STORAGE_KEY)).toBe(saved);
});
