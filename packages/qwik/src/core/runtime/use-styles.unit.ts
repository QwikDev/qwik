import { describe, expect, it } from 'vitest';
import { invoke, newChildInvokeContext, newInvokeContext } from './invoke-context';
import { useStylesScoped } from './use-styles';

describe('useStylesScoped', () => {
  it('registers custom-hook scopes lazily and deduplicates them', () => {
    const container = { styleIds: new Map([['red', '.red {}']]) } as any;
    const context = newInvokeContext({ container });

    invoke(context, () => {
      expect(useStylesScoped('.red {}', 'red', true)).toBe('⚡️red');
      useStylesScoped('.red {}', 'red', true);
    });

    expect(context.styleScopes).toEqual(['⚡️red']);
  });

  it('keeps the direct two-argument path free of scope registration', () => {
    const container = { styleIds: new Map([['red', '.red {}']]) } as any;
    const context = newInvokeContext({ container });

    invoke(context, () => useStylesScoped('.red {}', 'red'));

    expect(context.styleScopes).toBeUndefined();
  });

  it('does not inherit a custom scope into a child component context', () => {
    const container = { styleIds: new Map([['red', '.red {}']]) } as any;
    const context = newInvokeContext({ container });

    invoke(context, () => useStylesScoped('.red {}', 'red', true));

    expect(newChildInvokeContext(context).styleScopes).toBeUndefined();
  });
});
