import { flattenPrefetchResources } from './prefetch-implementation';
import type { PrefetchResource } from './types';

describe('prefetch implementation', () => {
  let p: PrefetchResource[];

  it('flattenPrefetchResources, no imports', () => {
    p = [
      { url: 'a.js', imports: [] },
      { url: 'b.js', imports: [] },
      { url: 'c.js', imports: [] },
    ];
    expect(flattenPrefetchResources(p)).toEqual(['a.js', 'b.js', 'c.js']);
  });

  it('flattenPrefetchResources, w/ imports', () => {
    p = [
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
    expect(flattenPrefetchResources(p)).toEqual(['a.js', 'x.js', 'y.js', 'b.js', 'c.js', 'z.js']);
  });
});
