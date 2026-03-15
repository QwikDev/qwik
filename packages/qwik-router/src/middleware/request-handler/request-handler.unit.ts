import { describe, it, expect, vi } from 'vitest';
import { requestHandler } from './request-handler';
import type { ServerRequestEvent } from './types';

function createMockServerRequestEvent(url = 'http://localhost/.well-known') {
  const mockRequest = new Request(url);

  return {
    mode: 'server',
    url: new URL(url),
    locale: undefined,
    platform: {},
    request: mockRequest,
    env: {
      get: vi.fn(),
    },
    getClientConn: vi.fn(() => ({ ip: '127.0.0.1' })),
    getWritableStream: vi.fn(() => {
      const writer = {
        write: vi.fn(),
        close: vi.fn(),
      } as any;
      return {
        getWriter: () => writer,
        locked: false,
        pipeTo: vi.fn(),
      } as any;
    }),
  } as unknown as ServerRequestEvent;
}

describe('requestHandler .well-known ignore', () => {
  it('returns null for /.well-known', async () => {
    const ev = createMockServerRequestEvent('http://localhost/.well-known');
    const result = await requestHandler(ev, {
      render: (async () => ({ html: '' })) as any,
      qwikRouterConfig: {} as any,
    });
    expect(result).toBeNull();
  });

  it('returns null for /.well-known/other', async () => {
    const ev = createMockServerRequestEvent('http://localhost/.well-known/acme-challenge/token');
    const result = await requestHandler(ev, {
      render: (async () => ({ html: '' })) as any,
      qwikRouterConfig: {} as any,
    });
    expect(result).toBeNull();
  });
});
