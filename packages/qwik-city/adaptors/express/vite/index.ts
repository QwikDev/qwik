import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdaptor } from '../../shared/vite';

/**
 * @alpha
 */
export function expressAdaptor(opts: ExpressAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'express',
    origin: process?.env?.URL || 'https://yoursitename.qwik.builder.io',
    staticGenerate: opts.staticGenerate,
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
 */
export interface ExpressAdaptorOptions {
  staticGenerate?: Omit<StaticGenerateRenderOptions, 'outDir'> | true;
}
