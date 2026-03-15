import type { SsgRenderOptions } from '../../../ssg';
import { viteAdapter } from '../../shared/vite';

/** @public */
export function ssgAdapter(opts: SsgAdapterOptions): any {
  return viteAdapter({
    name: 'static-site-generation',
    origin: opts.origin,
    ssg: {
      include: ['/*'],
      ...opts,
    },
  });
}

/** @public @deprecated Use `ssgAdapter` instead. */
export const staticAdapter = ssgAdapter;

/** @public */
export interface SsgAdapterOptions extends Omit<SsgRenderOptions, 'outDir'> {}
