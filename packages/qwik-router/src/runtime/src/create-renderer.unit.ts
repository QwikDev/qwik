import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderToStream: vi.fn(),
}));

vi.mock('@qwik.dev/core/server', () => ({
  renderToStream: mocks.renderToStream,
}));

import { createRenderer } from './create-renderer';

describe('createRenderer', () => {
  beforeEach(() => {
    mocks.renderToStream.mockReset();
    mocks.renderToStream.mockResolvedValue({} as any);
  });

  it('disables out-of-order streaming for static renders', async () => {
    const renderer = createRenderer((opts) => ({
      jsx: 'static' as any,
      options: {
        ...opts,
        streaming: {
          ...opts.streaming,
          outOfOrder: true,
        },
      } as any,
    }));

    await renderer({
      stream: { write: vi.fn() },
      serverData: {
        renderMode: 'static',
        qwikrouter: {
          ev: {},
        },
      },
    } as any);

    expect(mocks.renderToStream).toHaveBeenCalledWith(
      'static',
      expect.objectContaining({
        streaming: expect.objectContaining({
          outOfOrder: false,
        }),
      })
    );
  });

  it('keeps out-of-order streaming for server renders', async () => {
    const renderer = createRenderer((opts) => ({
      jsx: 'server' as any,
      options: {
        ...opts,
        streaming: {
          ...opts.streaming,
          outOfOrder: true,
        },
      } as any,
    }));

    await renderer({
      stream: { write: vi.fn() },
      serverData: {
        renderMode: 'server',
        qwikrouter: {
          ev: {},
        },
      },
    } as any);

    expect(mocks.renderToStream).toHaveBeenCalledWith(
      'server',
      expect.objectContaining({
        streaming: expect.objectContaining({
          outOfOrder: true,
        }),
      })
    );
  });
});
