import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/**
 * @alpha
 */
export function cloudRunAdapter(opts: CloudRunAdapterOptions = {}): any {
  return viteAdapter({
    name: 'cloud-run',
    origin: process?.env?.URL || 'https://your-app-name.run.app',
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
 * @alpha
 * @deprecated Use `cloudRunAdapter` exported from `@builder.io/qwik-city/adapters/cloud-run/vite` instead.
 */
export const cloudRunAdaptor = cloudRunAdapter;

/**
 * @alpha
 */
export interface CloudRunAdapterOptions extends ServerAdapterOptions {}

/**
 * @alpha
 * @deprecated Use `CloudRunAdapterOptions` instead.
 */
export type CloudRunAdaptorOptions = CloudRunAdapterOptions;

/**
 * @alpha
 */
export type { StaticGenerateRenderOptions };
