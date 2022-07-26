import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';

const test = testAppSuite('Build Menu');

test('menus found', ({ menus }) => {
  assert.is(menus.length, 1);
});

test('docs menu', ({ menus }) => {
  const docsMenu = menus.find((r) => r.pathname === '/docs')!;
  assert.ok(docsMenu, 'found docs menu');
  assert.is(docsMenu.pathname, '/docs');
});

test.run();
