import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @alpha
 */
export function nodeServerAdapter(opts: NodeServerAdapterOptions = {}): any {
  return viteAdapter({
    name: opts.name || 'node-server',
    origin: process?.env?.URL || 'https://yoursitename.qwik.builder.io',
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

/**
 * @alpha
 */
export interface NodeServerAdapterOptions extends ServerAdapterOptions {
  name?: string;
}

/**
 * @alpha
 */
export { StaticGenerateRenderOptions };
