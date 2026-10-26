import { expect, test } from '@playwright/test';

test.describe('service worker', () => {
  test('registers and runs code it shares with the app', async ({ page }) => {
    await page.goto('/greeting/');
    await expect(page.locator('#greeting')).toHaveText('hello from shared code');

    const reply = await page.evaluate(async () => {
      await navigator.serviceWorker.register('/service-worker.js');
      const { active } = await navigator.serviceWorker.ready;
      const channel = new MessageChannel();
      const response = new Promise((resolve) => {
        channel.port1.onmessage = (event) => resolve(event.data);
      });
      active!.postMessage('greet', [channel.port2]);
      return response;
    });

    expect(reply).toBe('hello from shared code');
  });
});
