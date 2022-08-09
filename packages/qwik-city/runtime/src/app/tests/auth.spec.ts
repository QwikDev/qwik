import { expect, test } from '@playwright/test';
import { assertPage, getPage, linkNavigate, load } from './util.js';

test('Qwik City Auth', async ({ context, javaScriptEnabled }) => {
  const ctx = await load(context, javaScriptEnabled, '/sign-in');

  /***********  Sign In  ***********/
  await assertPage(ctx, {
    pathname: '/sign-in',
    title: 'Sign In - Qwik',
    layoutHierarchy: ['root', 'auth'],
    h1: 'Sign In',
    activeHeaderLink: 'Sign In',
  });

  let page = getPage(ctx);
  await page.focus('input[name="username"]');
  await page.keyboard.type('quick');

  await page.focus('input[name="password"]');
  await page.keyboard.type('dev');

  /***********  Unsuccessful Sign In  ***********/
  const [try1] = await Promise.all([page.waitForNavigation(), page.click('[data-test-sign-in]')]);
  expect(try1!.status()).toBe(403);

  page = getPage(ctx);
  await page.focus('input[name="username"]');
  await page.keyboard.type('qwik');

  await page.focus('input[name="password"]');
  await page.keyboard.type('dev');

  /***********  Successful Sign In, Dashboard  ***********/
  const [try2] = await Promise.all([page.waitForNavigation(), page.click('[data-test-sign-in]')]);
  expect(try2!.status()).toBe(200);

  await assertPage(ctx, {
    pathname: '/dashboard',
    title: 'Dashboard Home - Qwik',
    layoutHierarchy: ['dashboard'],
    h1: 'Dashboard',
  });

  /***********  Go to Dashboard again, shouldn't redirect if signed in  ***********/
  await assertPage(ctx, {
    pathname: '/dashboard',
    title: 'Dashboard Home - Qwik',
    layoutHierarchy: ['dashboard'],
    h1: 'Dashboard',
  });

  /***********  Go to Dashboard settings, shouldn't redirect if signed in  ***********/
  await linkNavigate(ctx, '[data-test-link="dashboard-settings"]');
  await assertPage(ctx, {
    pathname: '/dashboard/settings',
    title: 'Dashboard Settings - Qwik',
    layoutHierarchy: ['dashboard'],
    h1: 'Settings',
  });

  /***********  Sign out  ***********/
  await linkNavigate(ctx, '[data-test-link="dashboard-sign-out"]');
  await assertPage(ctx, {
    pathname: '/sign-in',
  });

  /***********  Dashboard not signed in, redirected to signed in  ***********/
  page = getPage(ctx);
  await page.goto('/dashboard');
  await assertPage(ctx, {
    pathname: '/sign-in',
    title: 'Sign In - Qwik',
    layoutHierarchy: ['root', 'auth'],
    h1: 'Sign In',
    activeHeaderLink: 'Sign In',
  });
});
