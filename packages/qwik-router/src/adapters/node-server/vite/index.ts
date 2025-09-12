import type { SsgRenderOptions } from 'packages/qwik-router/src/ssg';
import { viteAdapter, type ServerAdapterOptions } from '../../shared/vite';

/** @beta */
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

/** @beta */
export interface NodeServerAdapterOptions extends ServerAdapterOptions {
  name?: string;
}

/** @beta */
export type { SsgRenderOptions };
