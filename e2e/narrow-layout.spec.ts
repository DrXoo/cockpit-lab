import { test, expect, openApp, importProject } from './support.ts';

test.use({ viewport: { width: 390, height: 844 } });

test('on a narrow screen the studio nav shows one panel at a time', async ({ page }) => {
  await openApp(page);
  await importProject(page, 'gt-room.json');
  const panels = { view: '#visualPanel', config: '#configPanel', checks: '#inspector' };

  for (const [workspace, shown] of Object.entries(panels)) {
    const button = page.locator(`.studio-nav [data-workspace="${workspace}"]`);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
    for (const panel of Object.values(panels))
      if (panel === shown) await expect(page.locator(panel)).toBeVisible();
      else await expect(page.locator(panel)).toBeHidden();
  }
});
