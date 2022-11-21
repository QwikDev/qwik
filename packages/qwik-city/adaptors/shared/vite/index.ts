import type { Plugin, UserConfig } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type {
  StaticGenerateOptions,
  StaticGenerateRenderOptions,
  StaticGenerateResult,
} from '@builder.io/qwik-city/static';
import type { BuildRoute } from '../../../buildtime/types';
import fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { postBuild } from './post-build';

export function viteAdaptor(opts: ViteAdaptorPluginOptions) {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;
  let isSsrBuild = false;
  let format = 'esm';

  const plugin: Plugin = {
    name: `vite-plugin-qwik-city-${opts.name}`,
    enforce: 'post',
    apply: 'build',

    config(config) {
      if (typeof opts.config === 'function') {
        return opts.config(config);
      }
    },

    configResolved(config) {
      isSsrBuild = !!config.build.ssr;

      if (isSsrBuild) {
        qwikCityPlugin = config.plugins.find(
          (p) => p.name === 'vite-plugin-qwik-city'
        ) as QwikCityPlugin;
        if (!qwikCityPlugin) {
          throw new Error('Missing vite-plugin-qwik-city');
        }
        qwikVitePlugin = config.plugins.find(
          (p) => p.name === 'vite-plugin-qwik'
        ) as QwikVitePlugin;
        if (!qwikVitePlugin) {
          throw new Error('Missing vite-plugin-qwik');
        }
        serverOutDir = config.build.outDir;

        if (config.build?.ssr !== true) {
          throw new Error(
            `"build.ssr" must be set to "true" in order to use the "${opts.name}" adaptor.`
          );
        }

        if (!config.build?.rollupOptions?.input) {
          throw new Error(
            `"build.rollupOptions.input" must be set in order to use the "${opts.name}" adaptor.`
          );
        }

        if (config.ssr?.format === 'cjs') {
          format = 'cjs';
        }
      }
    },

    generateBundle(_, bundles) {
      if (isSsrBuild) {
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
      }
    },

    closeBundle: {
      sequential: true,
      async handler() {
        if (isSsrBuild && serverOutDir && qwikCityPlugin?.api && qwikVitePlugin?.api) {
          const staticPaths: string[] = opts.staticPaths || [];
          const routes = qwikCityPlugin.api.getRoutes();
          const basePathname = qwikCityPlugin.api.getBasePathname();
          const clientOutDir = qwikVitePlugin.api.getClientOutDir()!;

          let staticGenerateResult: StaticGenerateResult | null = null;
          if (opts.staticGenerate && renderModulePath && qwikCityPlanModulePath) {
            let origin = opts.origin;
            if (!origin) {
              origin = `https://yoursite.qwik.builder.io`;
            }
            if (
              origin.length > 0 &&
              !origin.startsWith('https://') &&
              !origin.startsWith('http://')
            ) {
              origin = `https://${origin}`;
            }

            const staticGenerate = await import('../../../static');
            let generateOpts: StaticGenerateOptions = {
              basePathname,
              outDir: clientOutDir,
              origin,
              renderModulePath,
              qwikCityPlanModulePath,
            };

            if (opts.staticGenerate && typeof opts.staticGenerate === 'object') {
              generateOpts = {
                ...generateOpts,
                ...opts.staticGenerate,
              };
            }

            staticGenerateResult = await staticGenerate.generate(generateOpts);
            if (staticGenerateResult.errors > 0) {
              this.error(
                `Error while runnning SSG from "${opts.name}" adaptor. At least one path failed to render.`
              );
            }

            staticPaths.push(...staticGenerateResult.staticPaths);
          }

          const { staticPathsCode, notFoundPathsCode } = await postBuild(
            clientOutDir,
            basePathname,
            staticPaths,
            format,
            !!opts.cleanStaticGenerated
          );

          await Promise.all([
            fs.promises.writeFile(join(serverOutDir, RESOLVED_STATIC_PATHS_ID), staticPathsCode),
            fs.promises.writeFile(
              join(serverOutDir, RESOLVED_NOT_FOUND_PATHS_ID),
              notFoundPathsCode
            ),
          ]);

          if (typeof opts.generate === 'function') {
            await opts.generate({
              serverOutDir,
              clientOutDir,
              basePathname,
              routes,
              warn: (message) => this.warn(message),
              error: (message) => this.error(message),
            });
          }
        }
      },
    },
  };

  return plugin;
}

export function getParentDir(startDir: string, dirName: string) {
  const root = resolve('/');
  let dir = startDir;
  for (let i = 0; i < 20; i++) {
    dir = dirname(dir);
    if (basename(dir) === dirName) {
      return dir;
    }
    if (dir === root) {
      break;
    }
  }
  throw new Error(`Unable to find "${dirName}" directory from "${startDir}"`);
}

interface ViteAdaptorPluginOptions {
  name: string;
  origin: string;
  staticPaths?: string[];
  staticGenerate: true | Omit<StaticGenerateRenderOptions, 'outDir'> | undefined;
  cleanStaticGenerated?: boolean;
  config?: (config: UserConfig) => UserConfig;
  generate?: (generateOpts: {
    clientOutDir: string;
    serverOutDir: string;
    basePathname: string;
    routes: BuildRoute[];
    warn: (message: string) => void;
    error: (message: string) => void;
  }) => Promise<void>;
}

export const STATIC_PATHS_ID = '@qwik-city-static-paths';
export const RESOLVED_STATIC_PATHS_ID = `${STATIC_PATHS_ID}.js`;

export const NOT_FOUND_PATHS_ID = '@qwik-city-not-found-paths';
export const RESOLVED_NOT_FOUND_PATHS_ID = `${NOT_FOUND_PATHS_ID}.js`;
