import type { StaticGenerateRenderOptions } from '@qwik.dev/router/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';

/** @public */
export function cloudRunAdapter(opts: CloudRunAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'cloud-run',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://your-app-name.run.app',
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

/** @public */
export interface CloudRunAdapterOptions extends ServerAdapterOptions {}

/** @public */
export type { StaticGenerateRenderOptions };