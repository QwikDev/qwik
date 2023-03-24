import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @public
 * @deprecated - Use `nodeServerAdapter` exported from `@builder.io/qwik-city/adapters/node-server/vite` instead.
 */
export function expressAdapter(opts: ExpressAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'express',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://yoursitename.qwik.builder.io',
    staticGenerate: opts.staticGenerate,
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
 * @public
 * @deprecated - Use `nodeServerAdapter` exported from `@builder.io/qwik-city/adapters/node-server/vite` instead.
 */
export const expressAdaptor = expressAdapter;

/**
 * @public
 * @deprecated - Use `NodeServerAdapterOptions` exported from `@builder.io/qwik-city/adapters/node-server/vite` instead.
 */
export interface ExpressAdapterOptions extends ServerAdapterOptions {}

/**
 * @public
 * @deprecated - Use `NodeServerAdapterOptions` exported from `@builder.io/qwik-city/adapters/node-server/vite` instead.
 */
export type ExpressAdaptorOptions = ExpressAdapterOptions;

/**
 * @public
 * @deprecated - Use `StaticGenerateRenderOptions` exported from `@builder.io/qwik-city/adapters/node-server/vite` instead.
 */
export type { StaticGenerateRenderOptions };
