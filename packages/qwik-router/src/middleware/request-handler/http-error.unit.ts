import { describe, expect, it } from 'vitest';
import { RedirectMessage } from './redirect-handler';
import { RewriteMessage } from './rewrite-handler';
import {
  HttpError,
  ServerError,
  setFailureCacheControl,
  throwIfControlFlowSignal,
} from './http-error';

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

describe('setFailureCacheControl', () => {
  const createFailingRequest = (method: string) => ({
    request: new Request('http://localhost/products/42/', { method }),
    headers: new Headers({ 'Cache-Control': 'public, max-age=60' }),
  });

  it.each([
    [404, 'GET'],
    [405, 'GET'],
    [410, 'GET'],
    [501, 'GET'],
    [404, 'HEAD'],
  ])('keeps the Cache-Control set before a %i on a %s request', (status, method) => {
    const requestEv = createFailingRequest(method);

    setFailureCacheControl(requestEv as any, status);

    expect(requestEv.headers.get('Cache-Control')).toBe('public, max-age=60');
  });

  it.each([400, 401, 403, 409, 422, 429, 500, 503])(
    'sends private, no-store for a %i',
    (status) => {
      const requestEv = createFailingRequest('GET');

      setFailureCacheControl(requestEv as any, status);

      expect(requestEv.headers.get('Cache-Control')).toBe('private, no-store');
    }
  );

  it('sends private, no-store for a 404 on a POST request', () => {
    const requestEv = createFailingRequest('POST');

    setFailureCacheControl(requestEv as any, 404);

    expect(requestEv.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
