import { describe, expect, test, vi } from 'vitest';
import { runQwikRouterWithDeps } from './user-response-runner';
import type { ServerRequestEvent } from './types';

describe('runQwikRouterWithDeps', () => {
  test('does not throw when creating the request event fails', async () => {
    const error = new Error('createRequestEvent failed');
    const serverRequestEv = {
      request: { headers: new Headers() },
      getWritableStream: (_status: number, _headers: Headers, _cookies: unknown, resolve: any) => {
        resolve(null);
        return new WritableStream<Uint8Array>();
      },
    } as unknown as ServerRequestEvent;

    const run = runQwikRouterWithDeps(
      serverRequestEv,
      {} as any,
      [],
      async () => ({ loadedRoute: {} as any, requestHandlers: [] }),
      '/',
      {
        AbortMessage: class AbortMessage {},
        RedirectMessage: class RedirectMessage {},
        RewriteMessage: class RewriteMessage {
          pathname = '/';
        },
        ServerError: class ServerError {
          constructor(
            public status: number,
            public data: unknown
          ) {}
        },
        asyncRequestStore: undefined,
        createRequestEvent: vi.fn(() => {
          throw error;
        }),
        encoder: new TextEncoder(),
        getErrorHtml: () => '<h1>Internal Server Error</h1>',
      }
    );

    expect(run.requestEv.headersSent).toBe(false);
    await expect(run.response).resolves.toBeNull();
    await expect(run.completion).resolves.toBe(error);
  });
});
