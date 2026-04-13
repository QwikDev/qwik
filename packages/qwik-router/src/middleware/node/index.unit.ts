import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { QwikRouterNodeRequestOptions } from '.';

const { mockRequestHandler, mockFromNodeHttp, mockComputeOrigin, mockGetUrl } = vi.hoisted(() => ({
  mockRequestHandler: vi.fn(),
  mockFromNodeHttp: vi.fn(),
  mockComputeOrigin: vi.fn(() => 'http://localhost:3301'),
  mockGetUrl: vi.fn((req: { url?: string }, origin: string) => new URL(req.url || '/', origin)),
}));

vi.mock('@qwik.dev/core', () => ({
  isDev: false,
}));

vi.mock('@qwik.dev/core/server', () => ({
  setServerPlatform: vi.fn(),
}));

vi.mock('@qwik.dev/router/middleware/request-handler', () => ({
  isStaticPath: vi.fn(() => false),
  requestHandler: mockRequestHandler,
}));

vi.mock('./http', () => ({
  computeOrigin: mockComputeOrigin,
  fromNodeHttp: mockFromNodeHttp,
  getUrl: mockGetUrl,
}));

import { createQwikRouter } from './index';

const createNodeOptions = (): QwikRouterNodeRequestOptions => ({
  render: vi.fn() as any,
});

describe('createQwikRouter().router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not forward handled completion errors after headers are sent', async () => {
    const requestEv = {
      headersSent: true,
    };
    mockFromNodeHttp.mockResolvedValue({
      platform: {},
    });
    mockRequestHandler.mockResolvedValue({
      completion: Promise.resolve(new Error('already handled')),
      requestEv,
    });

    const next = vi.fn();
    const middleware = createQwikRouter(createNodeOptions());

    await middleware.router({ url: '/', headers: {} } as any, {} as any, next);

    expect(next).not.toHaveBeenCalled();
  });

  it('should forward completion errors when headers are not sent', async () => {
    const error = new Error('unhandled');
    mockFromNodeHttp.mockResolvedValue({
      platform: {},
    });
    mockRequestHandler.mockResolvedValue({
      completion: Promise.resolve(error),
      requestEv: {
        headersSent: false,
      },
    });

    const next = vi.fn();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const middleware = createQwikRouter(createNodeOptions());

    await middleware.router({ url: '/', headers: {} } as any, {} as any, next);

    expect(next).toHaveBeenCalledWith(error);
    consoleError.mockRestore();
  });
});
