import { describe, expect, it } from 'vitest';
import { RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { ServerError, throwIfControlFlowSignal } from './server-error';

describe('throwIfControlFlowSignal', () => {
  it('throws control-flow signals so returning behaves like throwing', () => {
    const redirect = new RedirectMessage();
    expect(() => throwIfControlFlowSignal(redirect)).toThrow(redirect);
    expect(() => throwIfControlFlowSignal(new RewriteMessage('/x'))).toThrow(RewriteMessage);
    const error = new ServerError(404, 'nope');
    expect(() => throwIfControlFlowSignal(error)).toThrow(error);
  });

  it('passes plain data through untouched', () => {
    for (const value of [undefined, null, 0, 'data', { ok: true }, [1, 2]]) {
      expect(() => throwIfControlFlowSignal(value)).not.toThrow();
    }
  });
});
