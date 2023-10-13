import { assert, test } from 'vitest';
import { flattenPrefetchResources } from './prefetch-utils';

test('flattenPrefetchResources, no imports', () => {
  const p = [
    { url: 'a.js', imports: [] },
    { url: 'b.js', imports: [] },
    { url: 'c.js', imports: [] },
  ];
  assert.deepEqual(flattenPrefetchResources(p), ['a.js', 'b.js', 'c.js']);
});

test('flattenPrefetchResources, w/ imports', () => {
  const p = [
    {
      url: 'a.js',
      imports: [
        { url: 'x.js', imports: [{ url: 'y.js', imports: [] }] },
        { url: 'y.js', imports: [] },
      ],
    },
    {
      url: 'b.js',
      imports: [
        { url: 'x.js', imports: [{ url: 'y.js', imports: [] }] },
        { url: 'y.js', imports: [] },
      ],
    },
    {
      url: 'c.js',
      imports: [
        { url: 'z.js', imports: [{ url: 'x.js', imports: [{ url: 'y.js', imports: [] }] }] },
      ],
    },
  ];
  assert.deepEqual(flattenPrefetchResources(p), ['a.js', 'x.js', 'y.js', 'b.js', 'c.js', 'z.js']);
});
