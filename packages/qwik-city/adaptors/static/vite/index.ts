import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdaptor } from '../../shared/vite';

/**
 * @alpha
 */
export function staticAdaptor(opts: StaticGenerateAdaptorOptions): any {
  return viteAdaptor({
    name: 'static-generate',
    staticGenerate: true,
    ...opts,
  });
}

/**
 * @alpha
 */
export interface StaticGenerateAdaptorOptions extends Omit<StaticGenerateRenderOptions, 'outDir'> {}
