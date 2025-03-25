import { assert, test } from 'vitest';
import { flattenPrefetchResources } from './prefetch-utils';

test('flattenPrefetchResources, no imports', () => {
  const p = [
    { url: 'a.js', imports: [], priority: false },
    { url: 'b.js', imports: [], priority: true },
    { url: 'c.js', imports: [], priority: false },
  ];
  assert.deepEqual(
    flattenPrefetchResources(p),
    new Map([
      ['a.js', false],
      ['b.js', true],
      ['c.js', false],
    ])
  );
});

test('flattenPrefetchResources, w/ imports', () => {
  const p = [
    {
      url: 'a.js',
      imports: [
        { url: 'x.js', imports: [{ url: 'y.js', imports: [], priority: false }], priority: false },
        { url: 'y.js', imports: [], priority: false },
      ],
      priority: false,
    },
    {
      url: 'b.js',
      imports: [
        { url: 'x.js', imports: [{ url: 'y.js', imports: [], priority: false }], priority: false },
        { url: 'y.js', imports: [], priority: false },
      ],
      priority: true,
    },
    {
      url: 'c.js',
      imports: [
        {
          url: 'z.js',
          imports: [
            {
              url: 'x.js',
              imports: [{ url: 'y.js', imports: [], priority: false }],
              priority: false,
            },
          ],
          priority: false,
        },
      ],
      priority: false,
    },
  ];
  assert.deepEqual(
    flattenPrefetchResources(p),
    new Map([
      ['a.js', false],
      ['x.js', false],
      ['y.js', false],
      ['b.js', true],
      ['c.js', false],
      ['z.js', false],
    ])
  );
});
