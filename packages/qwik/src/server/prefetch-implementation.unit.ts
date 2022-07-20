import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { flattenPrefetchResources } from './prefetch-implementation';

const prefetch = suite('prefetch implementation');

prefetch('flattenPrefetchResources, no imports', () => {
  const p = [
    { url: 'a.js', imports: [] },
    { url: 'b.js', imports: [] },
    { url: 'c.js', imports: [] },
  ];
  equal(flattenPrefetchResources(p), ['a.js', 'b.js', 'c.js']);
});

prefetch('flattenPrefetchResources, w/ imports', () => {
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
  equal(flattenPrefetchResources(p), ['a.js', 'x.js', 'y.js', 'b.js', 'c.js', 'z.js']);
});

prefetch.run();
