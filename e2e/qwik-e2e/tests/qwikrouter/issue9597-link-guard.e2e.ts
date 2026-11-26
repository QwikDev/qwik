import { expect, test } from '@playwright/test';

const guardPath = '/qwikrouter-test/guard/';

test('a signed-out visitor stays on the guard page and sees the login prompt', async ({ page }) => {
  await page.goto(guardPath);
  await page.waitForFunction(() => (window as any)._qwikEv?.roots);
  await page.getByRole('link', { name: 'Members', exact: true }).click();

  await expect
    .poll(async () => ({
      path: new URL(page.url()).pathname,
      loginShown: await page.getByText('Log in first').count(),
      membersShown: await page.getByRole('heading', { name: 'Members area' }).count(),
    }))
    .toEqual({ path: guardPath, loginShown: 1, membersShown: 0 });
  await expect(page.getByText('Log in first')).toBeVisible();
});

test('an unguarded Link still navigates', async ({ page }) => {
  await page.goto(guardPath);
  await page.waitForFunction(() => (window as any)._qwikEv?.roots);
  await page.getByRole('link', { name: 'Unprotected members' }).click();

  await expect(page).toHaveURL('/qwikrouter-test/guard/members/');
  await expect(page.getByRole('heading', { name: 'Members area' })).toBeVisible();
});

test('a guard navigating itself adds one history entry', async ({ page }) => {
  await page.goto(guardPath);
  await page.waitForFunction(() => (window as any)._qwikEv?.roots);
  const historyLength = await page.evaluate(() => history.length);
  await page.getByRole('link', { name: 'Members with guarded navigation' }).click();

  await expect(page).toHaveURL('/qwikrouter-test/guard/members/');
  await expect(page.getByRole('heading', { name: 'Members area' })).toBeVisible();
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);

  await page.goBack();
  await expect(page).toHaveURL(guardPath);
});
