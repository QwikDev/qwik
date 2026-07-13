import { describe, expect, test } from 'vitest';
import { getRouteDetailsHref } from './route-url';

describe('getRouteDetailsHref', () => {
  test('keeps the complete route in one URL segment', () => {
    const route = '/url/do/trasy/ktora/chcesz';
    const href = getRouteDetailsHref('public-key', route);

    expect(href).toBe('/app/public-key/routes/%2Furl%2Fdo%2Ftrasy%2Fktora%2Fchcesz/');
    expect(decodeURIComponent(href.split('/').at(-2)!)).toBe(route);
    expect(getRouteDetailsHref('public-key', '/')).toBe('/app/public-key/routes/%2F/');
  });
});
