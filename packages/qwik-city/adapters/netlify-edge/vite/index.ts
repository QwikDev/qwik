import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { getParentDir, type ServerAdapterOptions, viteAdapter } from '../../shared/vite';
import fs, { existsSync } from 'node:fs';
import { join } from 'node:path';
import { basePathname } from '@qwik-city-plan';

/**
 * @public
 */
export function netlifyEdgeAdapter(opts: NetlifyEdgeAdapterOptions = {}): any {
  const env = process?.env;
  return viteAdapter({
    name: 'netlify-edge',
    origin: env?.ORIGIN ?? env?.URL ?? 'https://yoursitename.netlify.app',
    ssg: opts.ssg,
    staticPaths: opts.staticPaths,
    cleanStaticGenerated: true,

    config(config) {
      const outDir = config.build?.outDir || '.netlify/edge-functions/entry.netlify-edge';
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
              cache: 'manual',
              excludedPath: opts.excludedPath || '',
            },
          ],
          version: 1,
        };

        const jsPath = join(serverOutDir, 'entry.netlify-edge.js');
        const mjsPath = join(serverOutDir, 'entry.netlify-edge.mjs');

        if (existsSync(mjsPath)) {
          await fs.promises.writeFile(
            jsPath,
            [
              `import entry_netlifyEdge from './entry.netlify-edge.mjs';`,
              `export default entry_netlifyEdge;`,
            ].join('\n')
          );
        }

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
 * @public
 */
export interface NetlifyEdgeAdapterOptions extends ServerAdapterOptions {
  /**
   * Determines if the build should generate the edge functions declarations `manifest.json` file.
   *
   * https://docs.netlify.com/edge-functions/declarations/
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
  /**
   * Manually add path pattern that should be excluded from the edge function routes
   * that are created by the 'manifest.json' file.
   */
  excludedPath?: string;
}

/**
 * @public
 */
export type { StaticGenerateRenderOptions };
