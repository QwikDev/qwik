import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockRequestHandler } = vi.hoisted(() => ({
  mockRequestHandler: vi.fn(),
}));

vi.mock('@qwik.dev/core/server', () => ({
  setServerPlatform: vi.fn(),
}));

vi.mock('@qwik.dev/router/middleware/request-handler', () => ({
  getErrorHtml: vi.fn(),
  isStaticPath: vi.fn(() => false),
  requestHandler: mockRequestHandler,
}));

import { createQwikRouter } from './index';

describe('createQwikRouter()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('collects response chunks without reallocating accumulated bytes', async () => {
    const NativeUint8Array = Uint8Array;
    const chunks = [
      NativeUint8Array.from([1, 2]),
      NativeUint8Array.from([3, 4, 5]),
      NativeUint8Array.from([6]),
    ];
    const allocations: number[] = [];

    mockRequestHandler.mockImplementation(async (serverRequestEv) => {
      vi.stubGlobal(
        'Uint8Array',
        new Proxy(NativeUint8Array, {
          construct(target, args) {
            if (typeof args[0] === 'number' && args[0] > 0) {
              allocations.push(args[0]);
            }
            return Reflect.construct(target, args);
          },
        })
      );
      let resolve!: (response: unknown) => void;
      const response = new Promise((r) => (resolve = r));
      try {
        const stream = serverRequestEv.getWritableStream(
          200,
          new Headers(),
          { headers: () => [] },
          resolve
        );
        const writer = stream.getWriter();
        for (const chunk of chunks) {
          await writer.write(chunk);
          chunk.fill(0);
        }
        await writer.close();
      } finally {
        vi.unstubAllGlobals();
      }
      return { completion: Promise.resolve(), response };
    });

    const handler = createQwikRouter({ render: vi.fn() } as any);
    const response = await handler(
      {} as any,
      {
        method: 'GET',
        headers: { 'x-ms-original-url': 'http://localhost/' },
      } as any
    );

    expect(allocations).toEqual([6]);
    expect(Array.from(response.body as Uint8Array)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
