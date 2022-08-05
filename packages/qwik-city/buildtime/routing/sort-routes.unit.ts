import { test } from 'uvu';
import { equal } from 'uvu/assert';
import type { BuildRoute } from '../types';
import { sortRoutes } from './sort-routes';

test(`sort compare`, async () => {
  const compare = [
    { higher: '/x/[...p]', lower: '/[...p]' },

    { higher: '/[p]/[p]', lower: '/[...p]/[...p]' },

    { higher: '/[p]/[p]', lower: '/[...p]' },

    { higher: '/[p]', lower: '/[...p]' },

    { higher: '/x/y/[p]', lower: '/[p]/[p]/[p]' },

    { higher: '/x/[p]/[p]', lower: '/[p]/[p]/[p]' },

    { higher: '/x/y/z', lower: '/[p]/[p]/[p]' },

    { higher: '/x/y/z', lower: '/x/[p]/[p]' },

    { higher: '/x/y/z', lower: '/x/y/[p]' },

    { higher: '/x/[p]/[p]/y', lower: '/x/[p]/y' },

    { higher: '/x/[p]/z', lower: '/x/[p]' },

    { higher: '/x/y/[p]', lower: '/x/[p]' },

    { higher: '/x/[p]', lower: '/[p]/[p]' },

    { higher: '/x/[p]', lower: '/[p]' },

    { higher: '/x', lower: '/[p]' },

    { higher: '/x/y/z', lower: '/x/y' },

    { higher: '/x/y/[a]', lower: '/x/y/[z]' },

    { higher: '/x/y', lower: '/x' },

    { higher: '/abc', lower: '/xyz' },
  ];

  compare.forEach((c) => {
    const higher = route({ pathname: c.higher });
    const lower = route({ pathname: c.lower });
    equal(
      sortRoutes(higher, lower),
      -1,
      `${higher.pathname} is not higher than ${lower.pathname}, value -1`
    );
    equal(
      sortRoutes(lower, higher),
      1,
      `${higher.pathname} is not higher than ${lower.pathname}, value 1`
    );
  });
});

test(`endpoint > page`, async () => {
  const a = route({ type: 'endpoint' });
  const b = route({ type: 'page' });
  equal(sortRoutes(a, b), -1);
  equal(sortRoutes(b, a), 1);
});

function route(r: TestRoute) {
  const br: BuildRoute = {
    type: r.type || 'page',
    id: '',
    filePath: '',
    paramNames: r.paramNames || [],
    pathname: r.pathname || '/',
    pattern: /bogus/,
    layouts: [],
  };
  return br;
}

interface TestRoute {
  type?: 'page' | 'endpoint';
  paramNames?: string[];
  pathname?: string;
}

test.run();
