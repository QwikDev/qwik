import type { Plugin } from 'vite';
import type { PluginContext } from 'rollup';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type { StaticGenerateOptions, StaticGenerateRenderOptions } from '../../../static';
import { join } from 'node:path';
import fs from 'node:fs';

/**
 * @alpha
 */
export function cloudflarePagesAdaptor(opts: CloudflarePagesAdaptorOptions = {}): any {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;

  async function generateBundles(ctx: PluginContext) {
    const qwikVitePluginApi = qwikVitePlugin!.api;
    const clientOutDir = qwikVitePluginApi.getClientOutDir()!;
    const files = await fs.promises.readdir(clientOutDir, { withFileTypes: true });
    const exclude = files
      .map((file) => {
        if (file.name.startsWith('.')) {
          return null;
        }
        if (file.isDirectory()) {
          return `/${file.name}/*`;
        } else if (file.isFile()) {
          return `/${file.name}`;
        }
        return null;
      })
      .filter(isNotNullable);
    const include: string[] = ['/*'];

    const serverPackageJsonPath = join(serverOutDir!, 'package.json');
    const serverPackageJsonCode = `{"type":"module"}`;
    await fs.promises.mkdir(serverOutDir!, { recursive: true });
    await fs.promises.writeFile(serverPackageJsonPath, serverPackageJsonCode);

    if (opts.staticGenerate && renderModulePath && qwikCityPlanModulePath) {
      const staticGenerate = await import('../../../static');
      let generateOpts: StaticGenerateOptions = {
        outDir: clientOutDir,
        origin: process?.env?.CF_PAGES_URL || 'https://your.cloudflare.pages.dev',
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
      const results = await staticGenerate.generate(generateOpts);
      results.staticPaths.sort();
      results.staticPaths.sort((a, b) => {
        return a.length - b.length;
      });
      if (results.errors > 0) {
        ctx.error('Error while runnning SSG. At least one path failed to render.');
      }
      exclude.push(...results.staticPaths);
    }

    const hasRoutesJson = exclude.includes('/_routes.json');
    if (!hasRoutesJson && opts.functionRoutes !== false) {
      const routesJsonPath = join(clientOutDir, '_routes.json');
      const total = include.length + exclude.length;
      const maxRules = 100;
      if (total > maxRules) {
        const toRemove = total - maxRules;
        const removed = exclude.splice(-toRemove, toRemove);
        ctx.warn(
          `Cloudflare pages does not support more than 100 static rules. Qwik SSG generated ${total}, the following rules were excluded: ${JSON.stringify(
            removed,
            undefined,
            2
          )}`
        );
        ctx.warn('Create an configure a "_routes.json" manually in the public.');
      }

      const routesJson = {
        version: 1,
        include,
        exclude,
      };
      await fs.promises.writeFile(routesJsonPath, JSON.stringify(routesJson, undefined, 2));
    }
  }

  const plugin: Plugin = {
    name: 'vite-plugin-qwik-city-cloudflare-pages',
    enforce: 'post',
    apply: 'build',

    config() {
      return {
        build: {
          rollupOptions: {
            output: {
              hoistTransitiveImports: false,
            },
          },
        },
        ssr: {
          target: 'webworker',
        },
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
          '"build.ssr" must be set to `true` in order to use the Cloudflare Pages adaptor.'
        );
      }

      if (!build?.rollupOptions?.input) {
        throw new Error(
          '"build.rollupOptions.input" must be set in order to use the Cloudflare Pages adaptor.'
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
      await generateBundles(this);
    },
  };
  return plugin;
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

export type { StaticGenerateRenderOptions } from '../../../static';

const isNotNullable = <T>(v: T): v is NonNullable<T> => {
  return v != null;
};
