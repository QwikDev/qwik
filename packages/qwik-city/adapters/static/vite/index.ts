import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdapter } from '../../shared/vite';

/**
 * @public
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
 * @public
 * @deprecated Use `staticAdapter` exported from `@builder.io/qwik-city/adapters/static/vite` instead.
 */
export const staticAdaptor = staticAdapter;

/**
 * @public
 */
export interface StaticGenerateAdapterOptions extends Omit<StaticGenerateRenderOptions, 'outDir'> {}

/**
 * @public
 * @deprecated Use `StaticGenerateAdapterOptions` instead.
 */
export type StaticGenerateAdaptorOptions = StaticGenerateAdapterOptions;
