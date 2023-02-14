import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @alpha
 */
export function expressAdapter(opts: ExpressAdapterOptions = {}): any {
  return viteAdapter({
    name: 'express',
    origin: process?.env?.URL || 'https://yoursitename.qwik.builder.io',
    staticGenerate: opts.staticGenerate,
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    config() {
      return {
        ssr: {
          target: 'node',
          noExternal: ['@builder.io/qwik-city'],
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
 * @deprecated Use `expressAdapter` exported from `@builder.io/qwik-city/adapters/express/vite` instead.
 */
export const expressAdaptor = expressAdapter;

/**
 * @alpha
 */
export interface ExpressAdapterOptions extends ServerAdapterOptions {}

/**
 * @alpha
 * @deprecated Use `ExpressAdapterOptions` instead.
 */
export type ExpressAdaptorOptions = ExpressAdapterOptions;

/**
 * @alpha
 */
export { StaticGenerateRenderOptions };
