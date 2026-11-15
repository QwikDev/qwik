import { expect, test } from 'vitest';
import { readGuidePreference, saveGuidePreference } from './preference';

test('remembers each report independently across visits', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  expect(readGuidePreference(storage, 'routes')).toBe(false);
  saveGuidePreference(storage, 'routes', true);
  expect(readGuidePreference(storage, 'routes')).toBe(true);
  expect(readGuidePreference(storage, 'bundles')).toBe(false);
  saveGuidePreference(storage, 'routes', false);
  expect(readGuidePreference(storage, 'routes')).toBe(false);
});

test('keeps guidance usable when browser storage is unavailable', () => {
  const storage = {
    getItem() {
      throw new Error('Storage blocked');
    },
    setItem() {
      throw new Error('Storage blocked');
    },
  };
  expect(readGuidePreference(storage, 'routes')).toBe(false);
  expect(() => saveGuidePreference(storage, 'routes', true)).not.toThrow();
});
