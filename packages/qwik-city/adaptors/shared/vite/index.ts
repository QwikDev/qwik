import type { Plugin, UserConfig } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type {
  StaticGenerateOptions,
  StaticGenerateRenderOptions,
  StaticGenerateResult,
} from '@builder.io/qwik-city/static';
import fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { BuildRoute } from 'packages/qwik-city/buildtime/types';

export function viteAdaptor(opts: ViteAdaptorPluginOptions) {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;
  let isSsrBuild = false;

  const plugin: Plugin = {
    name: `vite-plugin-qwik-city-${opts.name}`,
    enforce: 'post',
    apply: 'build',

    config(config) {
      if (typeof opts.config === 'function') {
        return opts.config(config);
      }
    },

    configResolved({ build, plugins }) {
      isSsrBuild = !!build.ssr;

      if (isSsrBuild) {
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
            `"build.ssr" must be set to "true" in order to use the "${opts.name}" adaptor.`
          );
        }

        if (!build?.rollupOptions?.input) {
          throw new Error(
            `"build.rollupOptions.input" must be set in order to use the "${opts.name}" adaptor.`
          );
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

    async closeBundle() {
      if (isSsrBuild && serverOutDir && qwikCityPlugin?.api && qwikVitePlugin?.api) {
        // create server package.json to ensure mjs is used
        const serverPackageJsonPath = join(serverOutDir, 'package.json');
        const serverPackageJsonCode = `{"type":"module"}`;
        await fs.promises.mkdir(serverOutDir, { recursive: true });
        await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

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
            basePathname: qwikCityPlugin.api.getBasePathname(),
            outDir: qwikVitePlugin.api.getClientOutDir()!,
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
        }

        if (typeof opts.generateRoutes === 'function') {
          await opts.generateRoutes({
            serverOutDir,
            clientOutDir: qwikVitePlugin.api.getClientOutDir()!,
            routes: qwikCityPlugin.api.getRoutes(),
            staticPaths: staticGenerateResult?.staticPaths ?? [],
            warn: (message) => this.warn(message),
            error: (message) => this.error(message),
          });
        }
      }
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
  staticGenerate: true | StaticGenerateRenderOptions | undefined;
  config?: (config: UserConfig) => UserConfig;
  generateRoutes?: (generateOpts: {
    clientOutDir: string;
    serverOutDir: string;
    routes: BuildRoute[];
    staticPaths: string[];
    warn: (message: string) => void;
    error: (message: string) => void;
  }) => Promise<void>;
}
