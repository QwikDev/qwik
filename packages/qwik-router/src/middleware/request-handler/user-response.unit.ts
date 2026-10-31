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

vi.mock('./request-event-core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./request-event-core')>()),
  createRequestEvent: mocks.createRequestEvent,
}));

vi.mock('./async-request-store', () => ({
  get _asyncRequestStore() {
    return mocks.asyncRequestStore;
  },
}));

import { RedirectMessage } from './redirect-handler';
import { ServerError } from './server-error';
import { runQwikRouter } from './user-response';
import type { ServerRequestEvent } from './types';

describe('runQwikRouter', () => {
  beforeEach(() => {
    mocks.createRequestEvent.mockReset();
    mocks.asyncRequestStore = undefined;
    mocks.isDev = true;
  });

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

  const failAfterResponseStarted = async () => {
    const written: string[] = [];
    const writer = {
      write: async (chunk: Uint8Array) => {
        written.push(new TextDecoder().decode(chunk));
      },
      close: vi.fn(),
    };
    const requestEv = {
      originalUrl: new URL('http://localhost/boom/'),
      request: new Request('http://localhost/boom/'),
      headers: new Headers(),
      headersSent: true,
      next: vi.fn(async () => {
        throw new Error('boom');
      }),
      getWritableStream: vi.fn(() => ({ locked: false, getWriter: () => writer })),
      isDirty: () => true,
    };
    mocks.createRequestEvent.mockReturnValue(requestEv);

    const completion = await runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/')
      .completion;

    return { completion, html: written.join(''), writer };
  };

  it('finishes and shows an error that is thrown after the response started in dev', async () => {
    const { completion, html, writer } = await failAfterResponseStarted();

    expect(html).toContain('boom');
    expect(writer.close).toHaveBeenCalled();
    expect(completion).toEqual(expect.objectContaining({ message: 'boom' }));
  });

  it('keeps the generic error page in production when SSR fails after the response started', async () => {
    mocks.isDev = false;

    const { completion, html } = await failAfterResponseStarted();

    expect(html).toContain('Internal Server Error');
    expect(html).not.toContain('boom');
    expect(completion).toEqual(expect.objectContaining({ message: 'boom' }));
  });

  it('resolves completion with nothing for a redirect', async () => {
    const requestEv = {
      originalUrl: new URL('http://localhost/'),
      next: vi.fn(async () => {
        throw new RedirectMessage();
      }),
      getWritableStream: vi.fn(() => ({ close: vi.fn() })),
      isDirty: () => true,
    };
    mocks.createRequestEvent.mockReturnValue(requestEv);

    const run = runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/');

    await expect(run.completion).resolves.toBeUndefined();
  });

  it.each(['application/json', 'text/html'])(
    'sends a thrown ServerError with Cache-Control: no-store for %s',
    async (accept) => {
      const requestEv = {
        originalUrl: new URL('http://localhost/members/'),
        request: new Request('http://localhost/members/', { headers: { Accept: accept } }),
        headers: new Headers({ 'Cache-Control': 'public, max-age=60' }),
        headersSent: false,
        sharedMap: new Map(),
        next: vi.fn(async () => {
          throw new ServerError(403, 'Members only');
        }),
        send: vi.fn(),
        html: vi.fn(),
        isDirty: () => true,
      };
      mocks.createRequestEvent.mockReturnValue(requestEv);

      await expect(
        runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/').completion
      ).resolves.toBeUndefined();

      expect(requestEv.send.mock.calls.length + requestEv.html.mock.calls.length).toBe(1);
      expect(requestEv.headers.get('Cache-Control')).toBe('no-store');
    }
  );
});
