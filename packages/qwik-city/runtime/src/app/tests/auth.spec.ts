import { test } from '@playwright/test';
import { assertPage, load } from './util';

test('Qwik City Page', async ({ context, javaScriptEnabled }) => {
  const ctx = await load(context, javaScriptEnabled, '/sign-in');

  /***********  Home Page  ***********/
  await assertPage(ctx, {
    pathname: '/sign-in',
    title: 'Sign In - Qwik',
    layoutHierarchy: ['root', 'auth'],
    h1: 'Sign In',
    activeHeaderLink: 'Sign In',
  });
});
