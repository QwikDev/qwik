import { describe, expect, it } from 'vitest';
import { RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import { HttpError, ServerError, throwIfControlFlowSignal } from './http-error';

describe('ServerError', () => {
  it('is the deprecated name of HttpError', () => {
    expect(new ServerError(404, 'nope')).toBeInstanceOf(HttpError);
    expect(new HttpError(404, 'nope')).toBeInstanceOf(ServerError);
  });
});

describe('throwIfControlFlowSignal', () => {
  it('throws control-flow signals so returning behaves like throwing', () => {
    const redirect = new RedirectMessage();
    expect(() => throwIfControlFlowSignal(redirect)).toThrow(redirect);
    expect(() => throwIfControlFlowSignal(new RewriteMessage('/x'))).toThrow(RewriteMessage);
    const error = new HttpError(404, 'nope');
    expect(() => throwIfControlFlowSignal(error)).toThrow(error);
  });

  it('passes plain data through untouched', () => {
    for (const value of [undefined, null, 0, 'data', { ok: true }, [1, 2]]) {
      expect(() => throwIfControlFlowSignal(value)).not.toThrow();
    }
  });
});
