import type { SsgRenderOptions } from 'packages/qwik-router/src/ssg';
import { viteAdapter, type ServerAdapterOptions } from '../../shared/vite';

/** @beta */
export function denoServerAdapter(opts: DenoServerAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: opts.name || 'deno-server',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://yoursitename.qwik.dev',
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    config() {
      return {
        resolve: {
          conditions: ['webworker', 'worker'],
        },
        ssr: {
          target: 'webworker',
          noExternal: true,
          external: ['node:async_hooks'],
        },
        build: {
          ssr: true,
          target: 'esnext',
          rollupOptions: {
            output: {
              format: 'es',
              hoistTransitiveImports: false,
            },
          },
        },
        publicDir: false,
      };
    },
  });
}

/** @beta */
export interface DenoServerAdapterOptions extends ServerAdapterOptions {
  name?: string;
}

/** @beta */
export type { SsgRenderOptions };
