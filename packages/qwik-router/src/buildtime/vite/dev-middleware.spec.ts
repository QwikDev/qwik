import { describe, it, expect, vi } from 'vitest';
import type { ViteDevServer } from 'vite';
import { sendRouterCssHotUpdate } from './dev-middleware';

const file = '/app/src/routes/docs/docs.css';

/** Minimal ViteDevServer stand-in with controllable client/SSR graphs and a spy on the HMR channel. */
function makeServer(opts: { client?: { url: string }[]; ssr?: { url: string }[] }) {
  const send = vi.fn();
  const graph = (mods?: { url: string }[]) => ({ getModulesByFile: () => (mods ? new Set(mods) : undefined) });
  const server = {
    environments: {
      client: { moduleGraph: graph(opts.client), hot: { send } },
      ssr: { moduleGraph: graph(opts.ssr) },
    },
  } as unknown as ViteDevServer;
  return { server, send };
}

describe('sendRouterCssHotUpdate', () => {
  it('ignores non-CSS files', () => {
    const { server, send } = makeServer({ ssr: [{ url: '/x.tsx' }] });
    expect(sendRouterCssHotUpdate(server, '/app/src/routes/index.tsx', 1)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('emits a deduped css-update for route CSS that only lives in the SSR graph', () => {
    const { server, send } = makeServer({
      ssr: [{ url: '/src/routes/docs/docs.css' }, { url: '/src/routes/docs/docs.css?inline' }],
    });
    expect(sendRouterCssHotUpdate(server, file, 123)).toBe(true);
    expect(send).toHaveBeenCalledWith({
      type: 'update',
      updates: [
        {
          type: 'css-update',
          path: '/src/routes/docs/docs.css',
          acceptedPath: '/src/routes/docs/docs.css',
          timestamp: 123,
        },
      ],
    });
  });

  it('defers to Vite when the CSS is already in the client graph', () => {
    const { server, send } = makeServer({
      client: [{ url: '/src/routes/docs/docs.css' }],
      ssr: [{ url: '/src/routes/docs/docs.css' }],
    });
    expect(sendRouterCssHotUpdate(server, file, 1)).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
