import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @public
 */
export function cloudRunAdapter(opts: CloudRunAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'cloud-run',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://your-app-name.run.app',
    staticGenerate: opts.staticGenerate,
    ssg: opts.ssg,
    cleanStaticGenerated: true,

    config() {
      return {
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
 * @deprecated Use `cloudRunAdapter` exported from `@builder.io/qwik-city/adapters/cloud-run/vite` instead.
 */
export const cloudRunAdaptor = cloudRunAdapter;

/**
 * @public
 */
export interface CloudRunAdapterOptions extends ServerAdapterOptions {}

/**
 * @public
 * @deprecated Use `CloudRunAdapterOptions` instead.
 */
export type CloudRunAdaptorOptions = CloudRunAdapterOptions;

/**
 * @public
 */
export type { StaticGenerateRenderOptions };
