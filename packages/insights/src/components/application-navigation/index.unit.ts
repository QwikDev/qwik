import { assert, test } from 'vitest';
import { isNavigationItemActive } from './active-path';

test('matches exact and nested application routes', () => {
  const root = '/app/demo/';

  assert.isTrue(isNavigationItemActive(root, root, true));
  assert.isFalse(isNavigationItemActive(`${root}manifests/`, root, true));
  assert.isTrue(isNavigationItemActive(`${root}symbols/edge/`, `${root}symbols/`));
  assert.isFalse(isNavigationItemActive(`${root}errors/`, `${root}symbols/`));
});
