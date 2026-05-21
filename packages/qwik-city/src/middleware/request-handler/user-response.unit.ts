import { describe, expect, test, vi } from 'vitest';
import { runQwikCity } from './user-response';
import type { ServerRequestEvent, QwikSerializer } from './types';

const mockQwikSerializer: QwikSerializer = {
  _deserializeData: vi.fn(),
  _serializeData: vi.fn(),
  _verifySerializable: vi.fn(),
};

describe('runQwikCity', () => {
  test('does not throw when creating the request event fails', async () => {
    const serverRequestEv = {
      mode: 'server',
      url: new URL('http://localhost/'),
      locale: undefined,
      platform: {},
      request: { headers: new Headers() } as unknown as Request,
      env: { get: () => undefined },
      getClientConn: () => ({}),
      getWritableStream: vi.fn(),
    } as unknown as ServerRequestEvent;

    const run = runQwikCity(
      serverRequestEv,
      null,
      [],
      async () => ({ loadedRoute: null, requestHandlers: [] }),
      true,
      '/',
      mockQwikSerializer
    );

    expect(run.requestEv.headersSent).toBe(false);
    await expect(run.response).resolves.toBeNull();
    await expect(run.completion).resolves.toBeInstanceOf(Error);
  });
});
