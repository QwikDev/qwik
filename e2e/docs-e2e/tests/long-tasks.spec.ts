import { expect, test } from '@playwright/test';
import { preloaderLinks, recordSpeculativePreloads } from '../../preloader-e2e/utils/gate';
import {
  longTasksFromThePreloader,
  throttleLikeAMidTierPhone,
  traceLongTasks,
} from '../../preloader-e2e/utils/long-tasks';

test.describe('docs home page', () => {
  test.describe.configure({ retries: 0 });

  test('no long task comes from the preloader', async ({ browser, page, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const manifest = await page.request.get('/q-manifest.json');
    const preloader = manifest.ok()
      ? ((await manifest.json().catch(() => ({}))) as { preloader?: string }).preloader
      : undefined;
    test.skip(
      !preloader && !process.env.CI,
      'needs the built docs: the dev server has no q-manifest.json'
    );
    expect(preloader, 'the built docs serve q-manifest.json naming the preloader').toBeTruthy();
    const preloaderUrl = new URL(`/build/${preloader}`, baseURL).href;
    await recordSpeculativePreloads(page);
    const cpuRate = await throttleLikeAMidTierPhone(page);
    const tasks = await traceLongTasks(
      browser,
      page,
      async () => {
        await page.goto('/');
        await page.waitForFunction(() => typeof (globalThis as any).qPreload === 'function');
        await page.waitForTimeout(10_000);
      },
      () => preloaderUrl,
      async () => new Set((await preloaderLinks(page)).map((link) => link.href))
    );
    await testInfo.attach('long-tasks.json', {
      body: JSON.stringify({ cpuRate, tasks }, null, 2),
      contentType: 'application/json',
    });
    expect(longTasksFromThePreloader(tasks)).toEqual([]);
  });
});
