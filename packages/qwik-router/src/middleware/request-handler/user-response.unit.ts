import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createRequestEvent: vi.fn(),
  asyncRequestStore: undefined as unknown,
}));

vi.mock('./request-event-core', () => ({
  createRequestEvent: mocks.createRequestEvent,
}));

vi.mock('./async-request-store', () => ({
  get _asyncRequestStore() {
    return mocks.asyncRequestStore;
  },
}));

import { runQwikRouter } from './user-response';
import type { ServerRequestEvent } from './types';

describe('runQwikRouter', () => {
  beforeEach(() => {
    mocks.createRequestEvent.mockReset();
    mocks.asyncRequestStore = undefined;
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
});
