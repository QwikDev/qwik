import { describe, expect, test } from 'vitest';
import { getAppRoutePath } from './route-path';

describe('application route path', () => {
  test('removes the application base when identifying the current route', () => {
    expect(getAppRoutePath('/docs/about/', '/docs/')).toBe('/about/');
    expect(getAppRoutePath('/docs/', '/docs/')).toBe('/');
    expect(getAppRoutePath('/docs', '/docs/')).toBe('/');
    expect(getAppRoutePath('/docs-other/', '/docs/')).toBe('/docs-other/');
  });
});
