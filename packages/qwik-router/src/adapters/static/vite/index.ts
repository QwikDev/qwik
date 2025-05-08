import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdapter } from '../../shared/vite';

/** @public */
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

/** @public */
export interface StaticGenerateAdapterOptions extends Omit<StaticGenerateRenderOptions, 'outDir'> {}
