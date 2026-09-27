import { describe, expect, it } from 'vitest';
import { Constants, TypeIds, _constantNames, _typeIdNames } from './constants';
import { _dumpState } from './dump-state';

describe('_dumpState', () => {
  it('names every wire type id', () => {
    // A TypeIds member without a name dumps as `Unknown(n)` and rots every state snapshot.
    expect(_typeIdNames.length).toBe(TypeIds.SuspenseSubscription + 1);
    expect(_typeIdNames[TypeIds.SuspenseSubscription]).toBe('SuspenseSubscription');
  });

  it('names every constant', () => {
    expect(_constantNames.length).toBe(Constants.Ref + 1);
    expect(_constantNames[Constants.Ref]).toBe("'ref'");
  });

  it('numbers the roots and prints constants by name', () => {
    const dump = _dumpState(
      [TypeIds.Plain, 'hi', TypeIds.Constant, Constants.Null],
      false,
      '',
      null
    );

    expect(dump).toContain('0 {string} "hi"');
    expect(dump).toContain('1 Constant null');
  });

  it('indents a nested array and leaves its entries unnumbered', () => {
    const dump = _dumpState([TypeIds.Array, [TypeIds.Plain, 1, TypeIds.Plain, 2]], false, '', null);

    expect(dump).toContain('0 Array [\n  {number} 1\n  {number} 2\n]');
  });
});
