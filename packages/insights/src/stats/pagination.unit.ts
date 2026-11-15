import { assert, test } from 'vitest';
import { getPageHref, paginateResults } from './pagination';

test('keeps every report row accessible in pages of 25', () => {
  const rows = Array.from({ length: 53 }, (_, index) => index);
  const pages = ['1', '2', '3'].map((page) => paginateResults(rows, page));
  assert.deepEqual(
    pages.map((page) => page.items.length),
    [25, 25, 3]
  );
  assert.deepEqual(
    pages.flatMap((page) => page.items),
    rows
  );
  assert.deepEqual(
    pages.map(({ page, pageCount, total }) => ({ page, pageCount, total })),
    [
      { page: 1, pageCount: 3, total: 53 },
      { page: 2, pageCount: 3, total: 53 },
      { page: 3, pageCount: 3, total: 53 },
    ]
  );
});

test('clamps out-of-range pages and handles empty reports', () => {
  const rows = Array.from({ length: 26 }, (_, index) => index);
  for (const requestedPage of [null, '', '0', '-2', 'oops', '2.5', 'Infinity']) {
    assert.equal(paginateResults(rows, requestedPage).page, 1);
  }
  assert.equal(paginateResults(rows, '999999').page, 2);
  assert.deepEqual(paginateResults([], '10'), {
    items: [],
    page: 1,
    pageCount: 1,
    total: 0,
  });
});

test('changes report pages without dropping manifest ranges or filters', () => {
  const url = new URL(
    'https://insights.qwik.dev/app/example/symbols/?page=3&limit=50&manifest=a%2Cb#report'
  );
  const href = getPageHref(url, 'symbolPage', 2);
  assert.equal(href, '/app/example/symbols/?page=3&limit=50&manifest=a%2Cb&symbolPage=2#report');
  assert.equal(
    getPageHref(new URL(href, url), 'symbolPage', 1),
    url.pathname + url.search + url.hash
  );
  assert.isFalse(url.searchParams.has('symbolPage'));
});
