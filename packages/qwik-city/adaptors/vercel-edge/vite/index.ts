import type { StaticGenerateRenderOptions } from '@builder.io/qwik-city/static';
import { getParentDir, ServerAdaptorOptions, viteAdaptor } from '../../shared/vite';
import fs from 'node:fs';
import { join } from 'node:path';

/**
 * @alpha
 */
export function vercelEdgeAdaptor(opts: VercelEdgeAdaptorOptions = {}): any {
  return viteAdaptor({
    name: 'vercel-edge',
    origin: process?.env?.VERCEL_URL || 'https://yoursitename.vercel.app',
    staticGenerate: opts.staticGenerate,
    ssg: opts.ssg,
    staticPaths: opts.staticPaths,
    cleanStaticGenerated: true,

    config(config) {
      const outDir = config.build?.outDir || '.vercel/output/functions/_qwik-city.func';
      return {
        resolve: {
          conditions: ['webworker', 'worker'],
        },
        ssr: {
          target: 'node',
          format: 'esm',
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

    async generate({ clientOutDir, serverOutDir, basePathname, outputEntries }) {
      const vercelOutputDir = getParentDir(serverOutDir, 'output');

      if (opts.outputConfig !== false) {
        // https://vercel.com/docs/build-output-api/v3#features/edge-middleware
        const vercelOutputConfig = {
          routes: [
            { handle: 'filesystem' },
            {
              src: basePathname + '.*',
              dest: '/_qwik-city',
            },
          ],
          version: 3,
        };

        await fs.promises.writeFile(
          join(vercelOutputDir, 'config.json'),
          JSON.stringify(vercelOutputConfig, null, 2)
        );
      }

      const vcConfigPath = join(serverOutDir, '.vc-config.json');

      let entrypoint = opts.vcConfigEntryPoint;
      if (!entrypoint) {
        if (outputEntries.some((n) => n === 'entry.vercel-edge.mjs')) {
          entrypoint = 'entry.vercel-edge.mjs';
        } else {
          entrypoint = 'entry.vercel-edge.js';
        }
      }

      const vcConfig = {
        runtime: 'edge',
        entrypoint,
        envVarsInUse: opts.vcConfigEnvVarsInUse,
      };
      await fs.promises.writeFile(vcConfigPath, JSON.stringify(vcConfig, null, 2));

      const staticDir = join(vercelOutputDir, 'static');

      if (fs.existsSync(staticDir)) {
        await fs.promises.rm(staticDir, { recursive: true });
      }

      await fs.promises.rename(clientOutDir, staticDir);
    },
  });
}

/**
 * @alpha
 */
export interface VercelEdgeAdaptorOptions extends ServerAdaptorOptions {
  /**
   * Determines if the build should auto-generate the `.vercel/output/config.json` config.
   *
   * Defaults to `true`.
   */
  outputConfig?: boolean;
  /**
   * The `entrypoint` property in the `.vc-config.json` file.
   * Indicates the initial file where code will be executed for the Edge Function.
   *
   * Defaults to `entry.vercel-edge.js`.
   */
  vcConfigEntryPoint?: string;
  /**
   * The `envVarsInUse` property in the `.vc-config.json` file.
   * List of environment variable names that will be available for the Edge Function to utilize.
   *
   * Defaults to `undefined`.
   */
  vcConfigEnvVarsInUse?: string[];
  /**
   * Manually add pathnames that should be treated as static paths and not SSR.
   * For example, when these pathnames are requested, their response should
   * come from a static file, rather than a server-side rendered response.
   */
  staticPaths?: string[];
}

export type { StaticGenerateRenderOptions };
