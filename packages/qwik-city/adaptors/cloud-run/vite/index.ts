import type { StaticGenerateRenderOptions } from '../../../static';
import { viteAdaptor } from '../../shared/vite';

/**
 * @alpha
 */
export function cloudRunAdaptor(opts: CloudRunAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'cloud-run',
    origin: process?.env?.URL || 'https://your-app-name.run.app',
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
export interface CloudRunAdaptorOptions {
  /**
   * Determines if the adaptor should also run Static Site Generation (SSG).
   */
  staticGenerate?: Omit<StaticGenerateRenderOptions, 'outDir'> | true;
}
