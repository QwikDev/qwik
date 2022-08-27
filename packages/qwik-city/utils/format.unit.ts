import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { msToString } from './format';

test('msToString', () => {
  const tests = [
    {
      ms: 0.05,
      expect: '0.05 ms',
    },
    {
      ms: 10.5,
      expect: '10.5 ms',
    },
    {
      ms: 100,
      expect: '100.0 ms',
    },
    {
      ms: 2000,
      expect: '2.0 s',
    },
    {
      ms: 120000,
      expect: '2.0 m',
    },
  ];

  tests.forEach((t) => {
    equal(msToString(t.ms), t.expect);
  });
});

test.run();
