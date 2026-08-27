import { assert } from 'vitest';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Menu');

test('menus found', ({ ctx: { menus } }) => {
  assert.deepEqual(menus.length, 1);
});

test('docs menu', ({ ctx: { menus } }) => {
  const docsMenu = menus.find((r) => r.pathname === '/docs/')!;
  assert.ok(docsMenu, 'found docs menu');
  assert.deepEqual(docsMenu.pathname, '/docs/');
});
