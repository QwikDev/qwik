import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRequestEvent: vi.fn(),
  asyncRequestStore: undefined as unknown,
  isDev: true,
}));

vi.mock('@qwik.dev/core/internal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@qwik.dev/core/internal')>()),
  get isDev() {
    return mocks.isDev;
  },
}));

vi.mock('./request-event-core', () => ({
  createRequestEvent: mocks.createRequestEvent,
}));

vi.mock('./async-request-store', () => ({
  get _asyncRequestStore() {
    return mocks.asyncRequestStore;
  },
}));

import { createCacheControl } from './cache-control';
import { HttpError } from './http-error';
import { runQwikRouter } from './user-response';
import type { CacheControl, ServerRequestEvent } from './types';

describe('runQwikRouter', () => {
  beforeEach(() => {
    mocks.createRequestEvent.mockReset();
    mocks.asyncRequestStore = undefined;
    mocks.isDev = true;
  });

  function createThrowingRequestEv(thrown: unknown, accept = 'text/html') {
    const headers = new Headers({ 'Cache-Control': 'public, max-age=60' });
    const writer = { write: vi.fn(), close: vi.fn() };
    return {
      originalUrl: new URL('http://localhost/members/'),
      request: new Request('http://localhost/members/', { headers: { Accept: accept } }),
      headers,
      headersSent: false,
      next: vi.fn(async () => {
        throw thrown;
      }),
      cacheControl: vi.fn((value: CacheControl) => {
        headers.set('Cache-Control', createCacheControl(value));
      }),
      status: vi.fn(),
      send: vi.fn(),
      html: vi.fn(),
      getWritableStream: vi.fn(() => ({ locked: false, getWriter: () => writer })),
      isDirty: () => true,
    };
  }

  it('does not throw when creating the request event fails', async () => {
    const error = new Error('createRequestEvent failed');
    mocks.createRequestEvent.mockImplementation(() => {
      throw error;
    });
    const serverRequestEv = {
      request: { headers: new Headers() },
    } as unknown as ServerRequestEvent;

    const run = runQwikRouter(
      serverRequestEv,
      {} as any,
      [],
      async () => ({ loadedRoute: {} as any, requestHandlers: [] }),
      '/'
    );

    expect(run.requestEv.headersSent).toBe(false);
    await expect(run.response).resolves.toBeNull();
    await expect(run.completion).resolves.toBe(error);
  });

  it('runs within the async request store, reading it at call time', () => {
    const requestEv = {};
    mocks.createRequestEvent.mockReturnValue(requestEv);
    const completion = Promise.resolve(undefined);
    const asyncRequestStore = { run: vi.fn(() => completion) };
    mocks.asyncRequestStore = asyncRequestStore;

    const result = runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/');

    expect(asyncRequestStore.run).toHaveBeenCalledWith(
      requestEv,
      expect.any(Function),
      requestEv,
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.completion).toBe(completion);
  });

  it.each(['application/json', 'text/html'])(
    'sends a thrown HttpError with Cache-Control: private, no-store for %s',
    async (accept) => {
      const requestEv = createThrowingRequestEv(new HttpError(403, 'Members only'), accept);
      mocks.createRequestEvent.mockReturnValue(requestEv);

      await runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/').completion;

      expect(requestEv.send.mock.calls.length + requestEv.html.mock.calls.length).toBe(1);
      expect(requestEv.headers.get('Cache-Control')).toBe('private, no-store');
    }
  );

  it.each(['application/json', 'text/html'])(
    'keeps the Cache-Control set before a thrown 404 HttpError for %s',
    async (accept) => {
      const requestEv = createThrowingRequestEv(new HttpError(404, 'No such product'), accept);
      mocks.createRequestEvent.mockReturnValue(requestEv);

      await runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/').completion;

      expect(requestEv.send.mock.calls.length + requestEv.html.mock.calls.length).toBe(1);
      expect(requestEv.headers.get('Cache-Control')).toBe('public, max-age=60');
    }
  );

  it('sends a crash that reaches the built-in error document with private, no-store', async () => {
    mocks.isDev = false;
    const requestEv = createThrowingRequestEv(new Error('db down'));
    mocks.createRequestEvent.mockReturnValue(requestEv);

    await runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/').completion;

    expect(requestEv.status).toHaveBeenCalledWith(500);
    expect(requestEv.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
