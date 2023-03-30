import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { type ServerAdapterOptions, viteAdapter } from '../../shared/vite';
import fs from 'node:fs';
import { join } from 'node:path';

/**
 * @public
 */
export function cloudflarePagesAdapter(opts: CloudflarePagesAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'cloudflare-pages',
    origin: env?.CF_PAGES_URL ?? env?.ORIGIN ?? 'https://your.cloudflare.pages.dev',
    ssg: opts.ssg,
    staticPaths: opts.staticPaths,
    cleanStaticGenerated: true,

    config() {
      return {
        resolve: {
          conditions: ['webworker', 'worker'],
        },
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
          exclude: [basePathname + 'build/*', basePathname + 'assets/*'],
        };
        await fs.promises.writeFile(routesJsonPath, JSON.stringify(routesJson, undefined, 2));
      }
    },
  });
}

/**
 * @public
 */
export interface CloudflarePagesAdapterOptions extends ServerAdapterOptions {
  /**
   * Determines if the build should generate the function invocation routes `_routes.json` file.
   *
   * https://developers.cloudflare.com/pages/platform/functions/routing/#functions-invocation-routes
   *
   * Defaults to `true`.
   */
  functionRoutes?: boolean;
  /**
   * Manually add pathnames that should be treated as static paths and not SSR.
   * For example, when these pathnames are requested, their response should
   * come from a static file, rather than a server-side rendered response.
   */
  staticPaths?: string[];
}

/**
 * @public
 */
export type { StaticGenerateRenderOptions };
