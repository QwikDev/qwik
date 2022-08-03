import { test, expect } from '@playwright/test';

test.describe('renderered', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/qwik-city');
    page.on('pageerror', (err) => expect(err).toEqual(undefined));
  });
  test('html tag has attributes', async ({ page }) => {
    const lang = await page.getAttribute('html', 'lang');
    const dir = await page.getAttribute('html', 'dir');
    expect(lang === 'en' && dir === 'ltr');
  });
});

// test.describe('API Route Form Submssion', () => {
//   test.beforeEach(async ({ page }) => {
//     await page.goto('/qwik-city/__auth/sign-in');
//     page.on('pageerror', (err) => expect(err).toEqual(undefined));
//   });
//   test('on-sign-in endpoint handles bad submission', async ({ page, context }) => {
//     // Sign in route only accepts 'admin' and 'password' for username and password
//     page.type('input[name=username]', 'admin');
//     page.type('input[name=password]', 'password');

//     const [response] = await Promise.all([
//       page.waitForResponse('/api/on-sign-in'),
//       page.click('form>button'),
//     ]);

//     const cookies = await context.cookies();
//     const token = cookies.find(({ name }) => name === 'qwikcity-auth-token');
//     expect(response.status() === 403 && token === undefined);
//   });
//   test('on-sign-in endpoint handles good submission', async ({ page, context }) => {
//     page.type('input[name=username]', 'admin');
//     page.type('input[name=password]', 'password');

//     const [response] = await Promise.all([
//       page.waitForResponse('/api/on-sign-in'),
//       page.click('form>button'),
//     ]);

//     const cookies = await context.cookies();
//     const token = cookies.find(({ name }) => name === 'qwikcity-auth-token');
//     expect(response.status() === 200 && token !== undefined);
//   });
// });

// export {};
