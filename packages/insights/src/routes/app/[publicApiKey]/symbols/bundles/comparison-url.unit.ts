import { expect, test } from 'vitest';
import { getComparisonHref } from './comparison-url';

test('preserves the dataset query when opening the comparison', () => {
  expect(
    getComparisonHref(new URL('https://example.test/app/demo/symbols/bundles/?limit=25'))
  ).toBe('../visualizations/?limit=25');
  expect(getComparisonHref(new URL('https://example.test/app/demo/symbols/bundles/'))).toBe(
    '../visualizations/'
  );
});
