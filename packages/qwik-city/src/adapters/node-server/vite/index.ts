import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { viteAdapter, type ServerAdapterOptions } from '../../shared/vite';

/** @alpha */
export function nodeServerAdapter(opts: NodeServerAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: opts.name || 'node-server',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://yoursitename.qwik.dev',
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    config() {
      return {
        ssr: {
          target: 'node',
        },
        build: {
          ssr: true,
        },
        publicDir: false,
      };
    },
  });
}

/** @alpha */
export interface NodeServerAdapterOptions extends ServerAdapterOptions {
  name?: string;
}

/** @alpha */
export type { StaticGenerateRenderOptions };
