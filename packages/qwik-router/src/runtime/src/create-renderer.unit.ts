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

  it('wraps JSX output in a target-native render root', async () => {
    const renderer = createRenderer((opts) => ({
      jsx: 'content' as any,
      options: opts,
    }));
    const options = {
      stream: { write: vi.fn() },
      serverData: {
        renderMode: 'server',
        qwikrouter: { ev: {} },
      },
    } as any;

    await renderer(options);

    const [root, receivedOptions] = mocks.renderToStream.mock.calls[0];
    expect(root()).toBe('content');
    expect(receivedOptions).toBe(options);
  });
});
