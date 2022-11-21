import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { viteAdaptor } from '../../shared/vite';
import fs from 'node:fs';
import { join } from 'node:path';

/**
 * @alpha
 */
export function cloudflarePagesAdaptor(opts: CloudflarePagesAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'cloudflare-pages',
    origin: process?.env?.CF_PAGES_URL || 'https://your.cloudflare.pages.dev',
    staticGenerate: opts.staticGenerate,
    staticPaths: opts.staticPaths,
    cleanStaticGenerated: true,

    config() {
      return {
        ssr: {
          target: 'webworker',
          noExternal: true,
        },
        build: {
          ssr: true,
          rollupOptions: {
            output: {
              format: 'es',
              hoistTransitiveImports: false,
            },
          },
        },
        publicDir: false,
      };
    },

    async generate({ clientOutDir, basePathname }) {
      const routesJsonPath = join(clientOutDir, '_routes.json');
      const hasRoutesJson = fs.existsSync(routesJsonPath);
      if (!hasRoutesJson && opts.functionRoutes !== false) {
        const routesJson = {
          version: 1,
          include: [basePathname + '*'],
          exclude: [
            basePathname + 'build/*',
            basePathname + 'assets/*',
            basePathname + '*/q-data.json',
          ],
        };
        await fs.promises.writeFile(routesJsonPath, JSON.stringify(routesJson, undefined, 2));
      }
    },
  });
}

/**
 * @alpha
 */
export interface CloudflarePagesAdaptorOptions {
  /**
   * Determines if the build should generate the function invocation routes `_routes.json` file.
   *
   * https://developers.cloudflare.com/pages/platform/functions/function-invocation-routes/
   *
   * Defaults to `true`.
   */
  functionRoutes?: boolean;
  /**
   * Determines if the adaptor should also run Static Site Generation (SSG).
   */
  staticGenerate?: Omit<StaticGenerateRenderOptions, 'outDir'> | true;
  /**
   * Manually add pathnames that should be treated as static paths and not SSR.
   * For example, when these pathnames are requested, their response should
   * come from a static file, rather than a server-side rendered response.
   */
  staticPaths?: string[];
}

export type { StaticGenerateRenderOptions };
