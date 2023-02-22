import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdapter } from '../../shared/vite';

/**
 * @alpha
 */
export function staticAdapter(opts: StaticGenerateAdapterOptions): any {
  return viteAdapter({
    name: 'static-generate',
    origin: opts.origin,
    ssg: {
      include: ['/*'],
      ...opts,
    },
  });
}

/**
 * @alpha
 * @deprecated Use `staticAdapter` exported from `@builder.io/qwik-city/adapters/static/vite` instead.
 */
export const staticAdaptor = staticAdapter;

/**
 * @alpha
 */
export interface StaticGenerateAdapterOptions extends Omit<StaticGenerateRenderOptions, 'outDir'> {}

/**
 * @alpha
 * @deprecated Use `StaticGenerateAdapterOptions` instead.
 */
export type StaticGenerateAdaptorOptions = StaticGenerateAdapterOptions;
