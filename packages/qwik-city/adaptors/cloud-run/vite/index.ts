import { ServerAdaptorOptions, viteAdaptor } from '../../shared/vite';

/**
 * @alpha
 */
export function cloudRunAdaptor(opts: CloudRunAdaptorOptions = {}): any {
  return viteAdaptor({
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
 */
export interface CloudRunAdaptorOptions extends ServerAdaptorOptions {}
