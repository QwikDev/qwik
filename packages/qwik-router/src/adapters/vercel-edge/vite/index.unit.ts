import { fileURLToPath } from 'node:url';
import { build, type Rolldown } from 'vite';
import { expect, test } from 'vitest';
import { vercelEdgeAdapter } from './index';

test.each([undefined, 'node'] as const)(
  'bundles native async local storage for the Vercel target %s',
  async (target) => {
    const [adapter] = vercelEdgeAdapter({ target, ssg: null });
    const config = adapter.config({});
    const entry = fileURLToPath(new URL('./entry.vercel-edge.js', import.meta.url));
    const result = (await build({
      ...config,
      configFile: false,
      logLevel: 'silent',
      ssr: {
        ...config.ssr,
        // Qwik's Vite plugin externalizes this native module.
        external: ['node:async_hooks'],
      },
      build: {
        ...config.build,
        write: false,
        minify: false,
        ssr: entry,
      },
      plugins: [
        {
          name: 'test-vercel-entry',
          resolveId(id) {
            if (id === entry) {
              return id;
            }
          },
          load(id) {
            if (id === entry) {
              return `export { getAsyncLocalStorage } from '@qwik.dev/core/async-local-storage';`;
            }
          },
        },
      ],
    })) as Rolldown.RolldownOutput;

    const chunk = result.output.find((output) => output.type === 'chunk' && output.isEntry);
    expect(chunk?.type).toBe('chunk');
    if (chunk?.type === 'chunk') {
      expect(chunk.imports).toContain('node:async_hooks');
      expect(chunk.code).not.toContain('getBuiltinModule');
    }
  }
);
