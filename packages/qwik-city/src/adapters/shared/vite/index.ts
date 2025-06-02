import type { Plugin, UserConfig } from 'vite';
import type { QwikCityPlugin } from '@builder.io/qwik-city/vite';
import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type {
  StaticGenerateOptions,
  StaticGenerateRenderOptions,
} from '@builder.io/qwik-city/static';
import type { BuildRoute } from '../../../buildtime/types';
import fs from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { postBuild } from './post-build';

/** @public */
export function viteAdapter(opts: ViteAdapterPluginOptions) {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;
  let isSsrBuild = false;
  let format = 'esm';
  const outputEntries: string[] = [];

  const plugin: Plugin<never> = {
    name: `vite-plugin-qwik-city-${opts.name}`,
    enforce: 'post',
    apply: 'build',

    config(config) {
      if (typeof opts.config === 'function') {
        config = opts.config(config);
      }
      config.define = {
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
        ...config.define,
      };
      return config;
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
            `"build.ssr" must be set to "true" in order to use the "${opts.name}" adapter.`
          );
        }

        if (!config.build?.rollupOptions?.input) {
          throw new Error(
            `"build.rollupOptions.input" must be set in order to use the "${opts.name}" adapter.`
          );
        }

        // @ts-ignore `format` removed in Vite 5
        if (config.ssr?.format === 'cjs') {
          format = 'cjs';
        }
      }
    },

    generateBundle(_, bundles) {
      if (isSsrBuild) {
        outputEntries.length = 0;

        for (const fileName in bundles) {
          const chunk = bundles[fileName];
          if (chunk.type === 'chunk' && chunk.isEntry) {
            outputEntries.push(fileName);

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
        if (
          isSsrBuild &&
          opts.ssg !== null &&
          serverOutDir &&
          qwikCityPlugin?.api &&
          qwikVitePlugin?.api
        ) {
          const staticPaths: string[] = opts.staticPaths || [];
          const routes = qwikCityPlugin.api.getRoutes();
          const basePathname = qwikCityPlugin.api.getBasePathname();
          const clientOutDir = qwikVitePlugin.api.getClientOutDir()!;
          const clientPublicOutDir = qwikVitePlugin.api.getClientPublicOutDir()!;
          const assetsDir = qwikVitePlugin.api.getAssetsDir();

          const rootDir = qwikVitePlugin.api.getRootDir() ?? undefined;
          if (renderModulePath && qwikCityPlanModulePath && clientOutDir && clientPublicOutDir) {
            let ssgOrigin = opts.ssg?.origin ?? opts.origin;
            if (!ssgOrigin) {
              ssgOrigin = `https://yoursite.qwik.dev`;
            }
            // allow for capacitor:// or http://
            if (ssgOrigin.length > 0 && !/:\/\//.test(ssgOrigin)) {
              ssgOrigin = `https://${ssgOrigin}`;
            }
            if (ssgOrigin.startsWith('//')) {
              ssgOrigin = `https:${ssgOrigin}`;
            }
            try {
              ssgOrigin = new URL(ssgOrigin).origin;
            } catch (e) {
              this.warn(
                `Invalid "origin" option: "${ssgOrigin}". Using default origin: "https://yoursite.qwik.dev"`
              );
              ssgOrigin = `https://yoursite.qwik.dev`;
            }

            const staticGenerate = await import('../../../static');
            const generateOpts: StaticGenerateOptions = {
              maxWorkers: opts.maxWorkers,
              basePathname,
              outDir: clientPublicOutDir,
              rootDir,
              ...opts.ssg,
              origin: ssgOrigin,
              renderModulePath,
              qwikCityPlanModulePath,
            };

            const staticGenerateResult = await staticGenerate.generate(generateOpts);
            if (staticGenerateResult.errors > 0) {
              const err = new Error(
                `Error while running SSG from "${opts.name}" adapter. At least one path failed to render.`
              );
              err.stack = undefined;
              this.error(err);
            }

            staticPaths.push(...staticGenerateResult.staticPaths);

            const { staticPathsCode, notFoundPathsCode } = await postBuild(
              clientPublicOutDir,
              assetsDir ? join(basePathname, assetsDir) : basePathname,
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
                outputEntries,
                serverOutDir,
                clientOutDir,
                clientPublicOutDir,
                basePathname,
                routes,
                assetsDir,
                warn: (message) => this.warn(message),
                error: (message) => this.error(message),
              });
            }
            this.warn(
              `\n==============================================` +
                `\nNote: Make sure that you are serving the built files with proper cache headers.` +
                `\nSee https://qwik.dev/docs/deployments/#cache-headers for more information.` +
                `\n==============================================`
            );
          }
        }
      },
    },
  };

  return plugin;
}

/** @public */
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

/** @public */
interface ViteAdapterPluginOptions {
  name: string;
  origin: string;
  staticPaths?: string[];
  ssg?: AdapterSSGOptions | null;
  cleanStaticGenerated?: boolean;
  maxWorkers?: number;
  config?: (config: UserConfig) => UserConfig;
  generate?: (generateOpts: {
    outputEntries: string[];
    clientOutDir: string;
    clientPublicOutDir: string;
    serverOutDir: string;
    basePathname: string;
    routes: BuildRoute[];
    assetsDir?: string;
    warn: (message: string) => void;
    error: (message: string) => void;
  }) => Promise<void>;
}

/** @public */
export interface ServerAdapterOptions {
  /**
   * Options the adapter should use when running Static Site Generation (SSG). Defaults the `filter`
   * to "auto" which will attempt to automatically decides if a page can be statically generated and
   * does not have dynamic data, or if it the page should instead be rendered on the server (SSR).
   * Setting to `null` will prevent any pages from being statically generated.
   */
  ssg?: AdapterSSGOptions | null;
}

/** @public */
export interface AdapterSSGOptions extends Omit<StaticGenerateRenderOptions, 'outDir' | 'origin'> {
  /** Defines routes that should be static generated. Accepts wildcard behavior. */
  include: string[];
  /**
   * Defines routes that should not be static generated. Accepts wildcard behavior. `exclude` always
   * take priority over `include`.
   */
  exclude?: string[];

  /**
   * The URL `origin`, which is a combination of the scheme (protocol) and hostname (domain). For
   * example, `https://qwik.dev` has the protocol `https://` and domain `qwik.dev`. However, the
   * `origin` does not include a `pathname`.
   *
   * The `origin` is used to provide a full URL during Static Site Generation (SSG), and to simulate
   * a complete URL rather than just the `pathname`. For example, in order to render a correct
   * canonical tag URL or URLs within the `sitemap.xml`, the `origin` must be provided too.
   *
   * If the site also starts with a pathname other than `/`, please use the `basePathname` option in
   * the Qwik City config options.
   */
  origin?: string;
}

/** @public */
export const STATIC_PATHS_ID = '@qwik-city-static-paths';

/** @public */
export const RESOLVED_STATIC_PATHS_ID = `${STATIC_PATHS_ID}.js`;

/** @public */
export const NOT_FOUND_PATHS_ID = '@qwik-city-not-found-paths';

/** @public */
export const RESOLVED_NOT_FOUND_PATHS_ID = `${NOT_FOUND_PATHS_ID}.js`;
