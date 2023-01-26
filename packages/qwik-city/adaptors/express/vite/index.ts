import { ServerAdaptorOptions, viteAdaptor } from '../../shared/vite';

/**
 * @alpha
 */
export function expressAdaptor(opts: ExpressAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'express',
    origin: process?.env?.URL || 'https://yoursitename.qwik.builder.io',
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
 */
export interface ExpressAdaptorOptions extends ServerAdaptorOptions {}
