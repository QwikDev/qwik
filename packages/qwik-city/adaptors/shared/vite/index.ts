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

/**
 * @alpha
 */
export function viteAdaptor(opts: ViteAdaptorPluginOptions) {
  let qwikCityPlugin: QwikCityPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikCityPlanModulePath: string | null = null;
  let isSsrBuild = false;
  let format = 'esm';
  const outputEntries: string[] = [];

  const plugin: Plugin = {
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
          const rootDir = qwikVitePlugin.api.getRootDir() ?? undefined;
          if (renderModulePath && qwikCityPlanModulePath && clientOutDir) {
            if (opts.staticGenerate) {
              this.warn(`Option "staticGenerate" is deprecated. Please use "ssg" option instead.`);
              opts.ssg = opts.ssg || {
                include: [],
              };
              if (typeof opts.staticGenerate === 'object') {
                opts.ssg = {
                  ...opts.staticGenerate,
                  ...opts.ssg,
                };
              }
            }

            if (Array.isArray(opts.ssg?.include) && opts.ssg!.include.length > 0) {
              let ssgOrigin = opts.origin;
              if (!ssgOrigin) {
                ssgOrigin = `https://yoursite.qwik.builder.io`;
              }
              if (
                ssgOrigin.length > 0 &&
                !ssgOrigin.startsWith('https://') &&
                !ssgOrigin.startsWith('http://')
              ) {
                ssgOrigin = `https://${ssgOrigin}`;
              }
              try {
                ssgOrigin = new URL(ssgOrigin).origin;
              } catch (e) {
                this.warn(
                  `Invalid "origin" option: "${ssgOrigin}". Using default origin: "https://yoursite.qwik.builder.io"`
                );
                ssgOrigin = `https://yoursite.qwik.builder.io`;
              }

              const staticGenerate = await import('../../../static');
              const generateOpts: StaticGenerateOptions = {
                maxWorkers: opts.maxWorkers,
                basePathname,
                outDir: clientOutDir,
                rootDir,
                ...opts.ssg,
                origin: ssgOrigin,
                renderModulePath,
                qwikCityPlanModulePath,
              };

              const staticGenerateResult = await staticGenerate.generate(generateOpts);
              if (staticGenerateResult.errors > 0) {
                const err = new Error(
                  `Error while runnning SSG from "${opts.name}" adaptor. At least one path failed to render.`
                );
                err.stack = undefined;
                this.error(err);
              }

              staticPaths.push(...staticGenerateResult.staticPaths);

              const { staticPathsCode, notFoundPathsCode } = await postBuild(
                clientOutDir,
                basePathname,
                staticPaths,
                format,
                !!opts.cleanStaticGenerated
              );

              await Promise.all([
                fs.promises.writeFile(
                  join(serverOutDir, RESOLVED_STATIC_PATHS_ID),
                  staticPathsCode
                ),
                fs.promises.writeFile(
                  join(serverOutDir, RESOLVED_NOT_FOUND_PATHS_ID),
                  notFoundPathsCode
                ),
              ]);
            }

            if (typeof opts.generate === 'function') {
              await opts.generate({
                outputEntries,
                serverOutDir,
                clientOutDir,
                basePathname,
                routes,
                warn: (message) => this.warn(message),
                error: (message) => this.error(message),
              });
            }
          }
        }
      },
    },
  };

  return plugin;
}

/**
 * @alpha
 */
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

/**
 * @alpha
 */
interface ViteAdaptorPluginOptions {
  name: string;
  origin: string;
  staticPaths?: string[];
  /**
   * @deprecated Please use `ssg` instead.
   */
  staticGenerate?: true | Omit<StaticGenerateRenderOptions, 'outDir'> | undefined;
  ssg?: AdaptorSSGOptions | null;
  cleanStaticGenerated?: boolean;
  maxWorkers?: number;
  config?: (config: UserConfig) => UserConfig;
  generate?: (generateOpts: {
    outputEntries: string[];
    clientOutDir: string;
    serverOutDir: string;
    basePathname: string;
    routes: BuildRoute[];
    warn: (message: string) => void;
    error: (message: string) => void;
  }) => Promise<void>;
}

/**
 * @alpha
 */
export interface ServerAdaptorOptions {
  /**
   * Options the adaptor should use when running Static Site Generation (SSG).
   * Defaults the `filter` to "auto" which will attempt to automatically decides if
   * a page can be statically generated and does not have dynamic data, or if it the page
   * should instead be rendered on the server (SSR). Setting to `null` will prevent any
   * pages from being statically generated.
   */
  ssg?: AdaptorSSGOptions | null;
  /**
   * @deprecated Please use `ssg` instead.
   */
  staticGenerate?: Omit<StaticGenerateRenderOptions, 'outDir'> | true;
}

/**
 * @alpha
 */
export interface AdaptorSSGOptions extends Omit<StaticGenerateRenderOptions, 'outDir' | 'origin'> {
  /**
   * Defines routes that should be static generated. Accepts wildcard behavior.
   */
  include: string[];
  /**
   * Defines routes that should not be static generated. Accepts wildcard behavior. `exclude` always
   * take priority over  `include`.
   */
  exclude?: string[];

  /**
   * The URL `origin`, which is a combination of the scheme (protocol) and hostname (domain).
   * For example, `https://qwik.builder.io` has the protocol `https://` and domain `qwik.builder.io`.
   * However, the `origin` does not include a `pathname`.
   *
   * The `origin` is used to provide a full URL during Static Site Generation (SSG), and to
   * simulate a complete URL rather than just the `pathname`. For example, in order to
   * render a correct canonical tag URL or URLs within the `sitemap.xml`, the `origin` must
   * be provided too.
   *
   * If the site also starts with a pathname other than `/`, please use the `basePathname`
   * option in the Qwik City config options.
   */
  origin?: string;
}

/**
 * @alpha
 */
export const STATIC_PATHS_ID = '@qwik-city-static-paths';

/**
 * @alpha
 */
export const RESOLVED_STATIC_PATHS_ID = `${STATIC_PATHS_ID}.js`;

/**
 * @alpha
 */
export const NOT_FOUND_PATHS_ID = '@qwik-city-not-found-paths';

/**
 * @alpha
 */
export const RESOLVED_NOT_FOUND_PATHS_ID = `${NOT_FOUND_PATHS_ID}.js`;
