import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentAsyncRequestStore: undefined as unknown,
  runQwikRouterWithDeps: vi.fn(),
}));

vi.mock('./request-event-ssg', () => ({
  createRequestEvent: vi.fn(),
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/async-request-store', () => ({
  _getAsyncRequestStore: () => mocks.currentAsyncRequestStore,
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/error-handler', () => ({
  getErrorHtml: vi.fn(),
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/request-utils', () => ({
  encoder: new TextEncoder(),
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/redirect-handler', () => ({
  AbortMessage: class AbortMessage {},
  RedirectMessage: class RedirectMessage {},
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/rewrite-handler', () => ({
  RewriteMessage: class RewriteMessage {
    constructor(public pathname: string) {}
  },
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/server-error', () => ({
  ServerError: class ServerError {
    constructor(
      public status: number,
      public data: unknown
    ) {}
  },
}));

vi.mock('@qwik-router-ssg-worker/middleware/request-handler/user-response-runner', () => ({
  runQwikRouterWithDeps: mocks.runQwikRouterWithDeps,
}));

import { runQwikRouter } from './user-response-ssg';

describe('runQwikRouter (SSG)', () => {
  beforeEach(() => {
    mocks.currentAsyncRequestStore = undefined;
    mocks.runQwikRouterWithDeps.mockReset();
  });

  it('reads async request store at call time', () => {
    const asyncRequestStore = { getStore: vi.fn() };
    mocks.currentAsyncRequestStore = asyncRequestStore;
    const expected = {
      completion: Promise.resolve(undefined),
      requestEv: {},
      response: Promise.resolve(null),
    };
    mocks.runQwikRouterWithDeps.mockReturnValue(expected);

    const result = runQwikRouter({} as any, {} as any, [], vi.fn() as any, '/');

    expect(result).toBe(expected);
    expect(mocks.runQwikRouterWithDeps).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.any(Array),
      expect.any(Function),
      '/',
      expect.objectContaining({
        asyncRequestStore,
      })
    );
  });
});
