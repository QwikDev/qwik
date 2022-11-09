import type { Plugin } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import { generateNetlifyEdgeManifest } from '../netlify-manifest';
import type { StaticGenerateOptions, StaticGenerateRenderOptions } from '../../../static';
import { basename, dirname, join, resolve } from 'node:path';
import fs from 'node:fs';

/**
 * @alpha
 */
export function netifyEdgeAdaptor(opts: NetlifyEdgeAdaptorOptions = {}): any {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;

  async function generateBundles() {
    const qwikVitePluginApi = qwikVitePlugin!.api;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;

    // create server package.json to ensure mjs is used
    const serverPackageJsonPath = join(serverOutDir!, 'package.json');
    const serverPackageJsonCode = `{"type":"module"}`;
    await fs.promises.mkdir(serverOutDir!, { recursive: true });
    await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

    const staticPaths: string[] = [];
    if (opts.staticGenerate && renderModulePath && qwikCityPlanModulePath) {
      const staticGenerate = await import('../../../static');
      let generateOpts: StaticGenerateOptions = {
        outDir: clientOutDir,
        origin: process?.env?.URL || 'https://yoursitename.netlify.app',
        renderModulePath: renderModulePath,
        qwikCityPlanModulePath: qwikCityPlanModulePath,
        basePathname: qwikCityPlugin!.api.getBasePathname(),
      };

      if (typeof opts.staticGenerate === 'object') {
        generateOpts = {
          ...generateOpts,
          ...opts.staticGenerate,
        };
      }

      const result = await staticGenerate.generate(generateOpts);
      staticPaths.push(...result.staticPaths);
    }

    // create the netlify edge function manifest
    // https://docs.netlify.com/edge-functions/create-integration/#generate-declarations
    const routes = qwikCityPlugin!.api.getRoutes();
    const netlifyManifest = generateNetlifyEdgeManifest(routes, staticPaths);
    const edgeFnsDir = getEdgeFunctionsDir(serverOutDir!);
    const netlifyManifestPath = join(edgeFnsDir, 'manifest.json');
    await fs.promises.writeFile(netlifyManifestPath, JSON.stringify(netlifyManifest, null, 2));
  }

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city-netlify-edge',
    enforce: 'post',
    apply: 'build',

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
            },
          },
        },
        publicDir: false,
      };
    },

    configResolved({ build, plugins }) {
      qwikCityPlugin = plugins.find((p) => p.name === 'vite-plugin-qwik-city') as QwikCityPlugin;
      if (!qwikCityPlugin) {
        throw new Error('Missing vite-plugin-qwik-city');
      }
      qwikVitePlugin = plugins.find((p) => p.name === 'vite-plugin-qwik') as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      serverOutDir = build.outDir;

      if (build?.ssr !== true) {
        throw new Error(
          '"build.ssr" must be set to `true` in order to use the Netlify Edge adaptor.'
        );
      }

      if (!build?.rollupOptions?.input) {
        throw new Error(
          '"build.rollupOptions.input" must be set in order to use the Netlify Edge adaptor.'
        );
      }
    },

    generateBundle(_, bundles) {
      for (const fileName in bundles) {
        const chunk = bundles[fileName];
        if (chunk.type === 'chunk' && chunk.isEntry) {
          if (chunk.name === 'entry.ssr') {
            renderModulePath = join(serverOutDir!, fileName);
          } else if (chunk.name === '@qwik-city-plan') {
            qwikCityPlanModulePath = join(serverOutDir!, fileName);
          }
        }
      }

      if (!renderModulePath) {
        throw new Error(
          'Unable to find "entry.ssr" entry point. Did you forget to add it to "build.rollupOptions.input"?'
        );
      }
      if (!qwikCityPlanModulePath) {
        throw new Error(
          'Unable to find "@qwik-city-plan" entry point. Did you forget to add it to "build.rollupOptions.input"?'
        );
      }
    },

    async closeBundle() {
      await generateBundles();
    },
  };
  return plugin;
}

function getEdgeFunctionsDir(serverOutDir: string) {
  const root = resolve('/');
  let dir = serverOutDir;
  for (let i = 0; i < 20; i++) {
    dir = dirname(dir);
    if (basename(dir) === 'edge-functions') {
      return dir;
    }
    if (dir === root) {
      break;
    }
  }
  throw new Error(`Unable to find edge functions dir from: ${serverOutDir}`);
}

/**
 * @alpha
 */
export interface NetlifyEdgeAdaptorOptions {
  staticGenerate?: StaticGenerateRenderOptions | true;
}
