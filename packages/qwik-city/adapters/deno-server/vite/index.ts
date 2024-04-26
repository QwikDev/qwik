import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { viteAdapter, type ServerAdapterOptions } from '../../shared/vite';

/** @alpha */
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

/** @alpha */
export interface DenoServerAdapterOptions extends ServerAdapterOptions {
  name?: string;
}

/** @alpha */
export type { StaticGenerateRenderOptions };
