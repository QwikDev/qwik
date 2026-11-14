import { expect, test } from 'vitest';
import { getReportScope, getReportHref } from './report-scope';

const manifests = ['latest', 'previous', 'older'].map((hash) => ({
  hash,
  timestamp: new Date('2026-11-01'),
}));

test('defaults to the latest distinct build and its predecessor', () => {
  expect(getReportScope(manifests, new URLSearchParams())).toMatchObject({
    selectedHash: 'latest',
    previousHash: 'previous',
    problem: null,
  });
  expect(getReportScope(manifests, new URLSearchParams('manifest=previous'))).toMatchObject({
    selectedHash: 'previous',
    previousHash: 'older',
  });
});

test('compares any two available builds or explicitly disables the baseline', () => {
  expect(
    getReportScope(manifests, new URLSearchParams('manifest=latest&baseline=older'))
  ).toMatchObject({ selectedHash: 'latest', previousHash: 'older' });
  expect(getReportScope(manifests, new URLSearchParams('baseline=none'))).toMatchObject({
    selectedHash: 'latest',
    previousHash: null,
  });
});

test('never silently substitutes a different build for an unavailable selection', () => {
  for (const query of ['manifest=foreign', 'baseline=foreign', 'manifest=latest&baseline=latest']) {
    expect(getReportScope(manifests, new URLSearchParams(query))).toMatchObject({
      selectedHash: null,
      previousHash: null,
      problem: expect.any(String),
    });
  }
  expect(getReportScope([], new URLSearchParams())).toMatchObject({
    selectedHash: null,
    previousHash: null,
    problem: null,
  });
});

test('carries only comparison context between reports and encodes opaque hashes', () => {
  expect(
    getReportHref(
      '/app/demo/symbols/',
      new URLSearchParams('manifest=build%2B1&baseline=old&page=3&symbolPage=2&q=checkout')
    )
  ).toBe('/app/demo/symbols/?manifest=build%2B1&baseline=old');
  expect(getReportHref('/app/demo/', new URLSearchParams())).toBe('/app/demo/');
});

test('pins resolved defaults across navigation when new builds arrive', async () => {
  const { getReportQuery } = await import('./report-scope');
  const query = new URLSearchParams('q=checkout');
  const scope = getReportScope(manifests, query);
  const href = getReportHref('/app/demo/symbols/', getReportQuery(query, scope));
  expect(href).toBe('/app/demo/symbols/?manifest=latest&baseline=previous');
  const newer = [{ hash: 'newer', timestamp: new Date() }, ...manifests];
  expect(getReportScope(newer, new URL(href, 'https://example.com').searchParams)).toMatchObject({
    selectedHash: 'latest',
    previousHash: 'previous',
  });
  expect(getReportQuery(query, getReportScope(manifests.slice(0, 1), query)).get('baseline')).toBe(
    'none'
  );
  expect(
    getReportQuery(new URLSearchParams('manifest=foreign'), {
      selectedHash: null,
      previousHash: null,
    }).get('manifest')
  ).toBe('foreign');
  expect(query.toString()).toBe('q=checkout');
});
