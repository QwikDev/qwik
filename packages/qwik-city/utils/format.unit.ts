import { assert, test } from 'vitest';
import { msToString } from './format';

[
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
].forEach((t) => {
  test(`msToString(${t.ms})`, () => {
    assert.equal(msToString(t.ms), t.expect);
  });
});
