import { describe, expect, it } from 'vitest';
import { Fragment, jsx, jsxDEV, jsxs } from './compiler-runtime';

describe('compiler JSX runtime', () => {
  it('does not construct runtime JSX or VNodes', () => {
    expect(typeof Fragment).toBe('symbol');
    expect(() => jsx('div', {})).toThrow('JSX must be transformed by the Qwik compiler.');
    expect(() => jsxs('div', {})).toThrow('JSX must be transformed by the Qwik compiler.');
    expect(() => jsxDEV('div', {})).toThrow('JSX must be transformed by the Qwik compiler.');
  });
});
