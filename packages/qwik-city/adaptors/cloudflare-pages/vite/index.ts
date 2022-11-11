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

    async generateRoutes({ clientOutDir, staticPaths, warn }) {
      const clientFiles = await fs.promises.readdir(clientOutDir, { withFileTypes: true });
      const exclude = clientFiles
        .map((f) => {
          if (f.name.startsWith('.')) {
            return null;
          }
          if (f.isDirectory()) {
            return `/${f.name}/*`;
          } else if (f.isFile()) {
            return `/${f.name}`;
          }
          return null;
        })
        .filter(isNotNullable);
      const include: string[] = ['/*'];

      const hasRoutesJson = exclude.includes('/_routes.json');
      if (!hasRoutesJson && opts.functionRoutes !== false) {
        staticPaths.sort();
        staticPaths.sort((a, b) => a.length - b.length);
        exclude.push(...staticPaths);

        const routesJsonPath = join(clientOutDir, '_routes.json');
        const total = include.length + exclude.length;
        const maxRules = 100;
        if (total > maxRules) {
          const toRemove = total - maxRules;
          const removed = exclude.splice(-toRemove, toRemove);
          warn(
            `Cloudflare Pages does not support more than 100 static rules. Qwik SSG generated ${total}, the following rules were excluded: ${JSON.stringify(
              removed,
              undefined,
              2
            )}`
          );
          warn('Please manually create a routes config in the "public/_routes.json" directory.');
        }

        const routesJson = {
          version: 1,
          include,
          exclude,
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
  staticGenerate?: StaticGenerateRenderOptions | true;
}

export type { StaticGenerateRenderOptions };

const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};
