import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @alpha
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
export type { StaticGenerateRenderOptions };
