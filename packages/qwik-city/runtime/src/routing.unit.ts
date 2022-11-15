import { parseRoutePathname } from '../../buildtime/routing/parse-pathname';
import { suite } from 'uvu';
import { equal } from 'uvu/assert';
import { getRouteParams } from './routing';

const routingTest = suite('routing');

routingTest('matches paths with patterns', () => {
  const tests = [
    {
      basenamePath: '/',
      pattern: '/stuff/[param]',
      path: '/stuff/thing',
      result: {
        param: 'thing',
      },
    },
    {
      basenamePath: '/',
      pattern: '/stuff/[param]',
      path: '/stuff/thing/',
      result: {
        param: 'thing',
      },
    },
    {
      basenamePath: '/',
      pattern: '/stuff/[...param]',
      path: '/stuff/thing/',
      result: {
        param: 'thing/',
      },
    },
  ];

  for (const t of tests) {
    testMatch(t.basenamePath, t.pattern, t.path, t.result);
  }
});

const testMatch = (
  basenamePath: string,
  pattern: string,
  pathname: string,
  result: Record<string, string> | null
) => {
  const actual = parseRoutePathname(basenamePath, pattern);
  const matched = actual.pattern.exec(pathname);
  if (matched === null) {
    equal(result, null);
  } else {
    equal(getRouteParams(actual.paramNames, matched), result);
  }
};

routingTest.run();
