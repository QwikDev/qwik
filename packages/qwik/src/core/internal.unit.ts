import { describe, expect, it } from 'vitest';
import { _getContextContainer } from './internal';

describe('_getContextContainer', () => {
  it('is undefined outside an invoke context instead of throwing', () => {
    // a QRL called from a microtask or after an `await` runs with no active context
    expect(_getContextContainer()).toBeUndefined();
  });
});
