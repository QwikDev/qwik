import { describe, expect, test } from 'vitest';
import { getSettingsHref } from './header-url';

describe('getSettingsHref', () => {
  test('links to settings only when an application is selected', () => {
    expect(getSettingsHref('221smyuj5gl')).toBe('/app/221smyuj5gl/edit/');
    expect(getSettingsHref(undefined)).toBeNull();
  });
});
