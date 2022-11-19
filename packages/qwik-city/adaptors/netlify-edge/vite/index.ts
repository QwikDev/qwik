import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { getParentDir, viteAdaptor } from '../../shared/vite';
import fs from 'node:fs';
import { join } from 'node:path';
import { basePathname } from '@qwik-city-plan';

/**
 * @alpha
 */
export function netifyEdgeAdaptor(opts: NetlifyEdgeAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'netlify-edge',
    origin: process?.env?.URL || 'https://yoursitename.netlify.app',
    staticGenerate: opts.staticGenerate,
    staticPaths: opts.staticPaths,
    cleanStaticGenerated: true,

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

    async generate({ serverOutDir }) {
      if (opts.functionRoutes !== false) {
        // https://docs.netlify.com/edge-functions/create-integration/#generate-declarations
        const netlifyEdgeManifest = {
          functions: [
            {
              path: basePathname + '*',
              function: 'entry.netlify-edge',
            },
          ],
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
  staticGenerate?: Omit<StaticGenerateRenderOptions, 'outDir'> | true;
  /**
   * Manually add pathnames that should be treated as static paths and not SSR.
   * For example, when these pathnames are requested, their response should
   * come from a static file, rather than a server-side rendered response.
   */
  staticPaths?: string[];
}

export type { StaticGenerateRenderOptions };
