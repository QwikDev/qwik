import { describe, expect, it } from 'vitest';
import type { ErrorRow } from '~/db';
import { formatErrorDate, getErrorRoute, getErrorSince, groupErrors } from './errors';

describe('groupErrors', () => {
  it('groups matching locations and keeps the latest event details', () => {
    const groups = groupErrors([
      errorRow({
        id: 1,
        timestamp: new Date('2026-07-29T08:00:00Z'),
        manifestHash: 'old',
        url: 'https://qwik.dev/search?query=qwik',
        stack: 'old stack',
      }),
      errorRow({
        id: 3,
        timestamp: new Date('2026-07-29T10:00:00Z'),
        manifestHash: 'latest',
        url: 'https://qwik.dev/docs/',
        stack: 'latest stack',
      }),
      errorRow({
        id: 2,
        timestamp: new Date('2026-07-29T09:00:00Z'),
        line: 12,
      }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      occurrences: 2,
      firstSeen: '2026-07-29T08:00:00.000Z',
      lastSeen: '2026-07-29T10:00:00.000Z',
      manifestHash: 'latest',
      url: 'https://qwik.dev/docs/',
      stack: 'latest stack',
    });
    expect(groups[1]).toMatchObject({
      occurrences: 1,
      line: 12,
    });
  });
});

describe('getErrorRoute', () => {
  it('returns a pathname or the original invalid URL', () => {
    expect(getErrorRoute('https://qwik.dev/search?query=qwik')).toBe('/search');
    expect(getErrorRoute('not a URL')).toBe('not a URL');
  });
});

describe('formatErrorDate', () => {
  it('includes the UTC date and time', () => {
    expect(formatErrorDate('2026-07-11T09:58:00.000Z')).toBe('Jul 11, 2026, 09:58');
  });
});

describe('getErrorSince', () => {
  it('returns the start of the rolling 30-day window', () => {
    expect(getErrorSince(Date.parse('2026-07-29T12:00:00Z'))).toEqual(
      new Date('2026-06-29T12:00:00Z')
    );
  });
});

function errorRow(overrides: Partial<ErrorRow>): ErrorRow {
  return {
    id: 0,
    publicApiKey: 'public-key',
    manifestHash: 'manifest',
    timestamp: new Date('2026-07-29T08:00:00Z'),
    url: 'https://qwik.dev/search',
    source: 'components/search.tsx',
    line: 42,
    column: 7,
    message: 'TypeError: Cannot read properties of undefined',
    error: 'TypeError',
    stack: 'at Search (components/search.tsx:42:7)',
    ...overrides,
  };
}
