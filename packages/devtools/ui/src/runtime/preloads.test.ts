import { describe, expect, test } from 'vitest';
import type { QwikPreloadEntryRemembered } from '@devtools/kit';
import { findBestQrlRequestMatch } from './preloads';

function entry(
  overrides: Partial<QwikPreloadEntryRemembered> &
    Pick<QwikPreloadEntryRemembered, 'id' | 'href' | 'normalizedHref'>,
): QwikPreloadEntryRemembered {
  return {
    id: overrides.id,
    href: overrides.href,
    normalizedHref: overrides.normalizedHref,
    rel: overrides.rel || 'modulepreload',
    as: overrides.as || 'script',
    resourceType: overrides.resourceType || 'script',
    status: overrides.status || 'loaded',
    source: overrides.source || 'performance',
    originKind: overrides.originKind || 'current-project',
    phase: overrides.phase || 'csr',
    discoveredAt: overrides.discoveredAt ?? 0,
    requestedAt: overrides.requestedAt,
    completedAt: overrides.completedAt,
    importDuration: overrides.importDuration,
    loadDuration: overrides.loadDuration,
    duration: overrides.duration,
    transferSize: overrides.transferSize,
    decodedBodySize: overrides.decodedBodySize,
    initiatorType: overrides.initiatorType,
    qrlSymbol: overrides.qrlSymbol,
    qrlRequestedAt: overrides.qrlRequestedAt,
    qrlToLoadDuration: overrides.qrlToLoadDuration,
    loadMatchQuality: overrides.loadMatchQuality,
    matchedBy: overrides.matchedBy || 'none',
    error: overrides.error,
  };
}

describe('findBestQrlRequestMatch', () => {
  test('prefers exact normalized href matches', () => {
    const match = findBestQrlRequestMatch(
      [
        entry({
          id: 1,
          href: 'http://localhost/build/a.js',
          normalizedHref: 'http://localhost/build/a.js',
          requestedAt: 10,
          completedAt: 20,
        }),
      ],
      {
        symbol: 's_a',
        normalizedHref: 'http://localhost/build/a.js',
        requestedAt: 12,
        phase: 'csr',
      },
    );

    expect(match).toEqual({
      entryId: 1,
      matchedBy: 'normalized-href',
      loadMatchQuality: 'best-effort',
    });
  });

  test('falls back to symbol and time-window heuristics', () => {
    const entries = [
      entry({
        id: 1,
        href: 'http://localhost/build/a.js',
        normalizedHref: 'http://localhost/build/a.js',
        requestedAt: 100,
        completedAt: 120,
        qrlSymbol: 's_a',
      }),
      entry({
        id: 2,
        href: 'http://localhost/build/b.js',
        normalizedHref: 'http://localhost/build/b.js',
        requestedAt: 200,
        completedAt: 240,
      }),
    ];

    expect(
      findBestQrlRequestMatch(entries, {
        symbol: 's_a',
        requestedAt: 105,
        phase: 'csr',
      }),
    ).toEqual({
      entryId: 1,
      matchedBy: 'resource-name',
      loadMatchQuality: 'best-effort',
    });

    expect(
      findBestQrlRequestMatch(entries, {
        symbol: 's_missing',
        requestedAt: 205,
        phase: 'csr',
      }),
    ).toEqual({
      entryId: 2,
      matchedBy: 'chunk-hash',
      loadMatchQuality: 'best-effort',
    });
  });

  test('returns no match when nothing is close enough', () => {
    expect(
      findBestQrlRequestMatch(
        [
          entry({
            id: 1,
            href: 'http://localhost/build/a.js',
            normalizedHref: 'http://localhost/build/a.js',
            requestedAt: 10,
            completedAt: 20,
          }),
        ],
        {
          symbol: 's_missing',
          requestedAt: 5000,
          phase: 'csr',
        },
      ),
    ).toEqual({
      matchedBy: 'none',
      loadMatchQuality: 'none',
    });
  });
});
