import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { getParentDir, viteAdaptor } from '../../shared/vite';
import fs from 'node:fs';
import { join } from 'node:path';

/**
 * @alpha
 */
export function netifyEdgeAdaptor(opts: NetlifyEdgeAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'netlify-edge',
    origin: process?.env?.URL || 'https://yoursitename.netlify.app',
    staticGenerate: opts.staticGenerate,

    config(config) {
      const outDir = config.build?.outDir || '.netlify/edge-functions/entry.netlify-edge';
      return {
        ssr: {
          target: 'webworker',
          noExternal: true,
        },
        build: {
          ssr: true,
          outDir,
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

    async generateRoutes({ serverOutDir, routes, staticPaths }) {
      if (opts.functionRoutes !== false) {
        const ssrRoutes = routes.filter((r) => !staticPaths.includes(r.pathname));

        // https://docs.netlify.com/edge-functions/create-integration/#generate-declarations
        const netlifyEdgeManifest = {
          functions: ssrRoutes.map((r) => {
            if (r.paramNames.length > 0) {
              return {
                // Replace opening and closing "/" if present
                pattern: r.pattern.toString().replace(/^\//, '').replace(/\/$/, ''),
                function: 'entry.netlify-edge',
              };
            }

            return {
              path: r.pathname,
              function: 'entry.netlify-edge',
            };
          }),
          version: 1,
        };

        const netlifyEdgeFnsDir = getParentDir(serverOutDir, 'edge-functions');
        await fs.promises.writeFile(
          join(netlifyEdgeFnsDir, 'manifest.json'),
          JSON.stringify(netlifyEdgeManifest, null, 2)
        );
      }
    },
  });
}

/**
 * @alpha
 */
export interface NetlifyEdgeAdaptorOptions {
  /**
   * Determines if the build should generate the edge functions declarations `manifest.json` file.
   *
   * https://docs.netlify.com/edge-functions/declarations/
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
