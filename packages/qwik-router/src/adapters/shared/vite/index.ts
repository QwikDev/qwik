import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { StaticGenerateOptions, SsgRenderOptions } from 'packages/qwik-router/src/ssg';
import type { QwikRouterPlugin } from '@qwik.dev/router/vite';
import { basename, dirname, join, resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import type { BuildRoute } from '../../../buildtime/types';
import { postBuild } from './post-build';

/**
 * Implements the SSG after the build is complete. Also provides a `generate(...)` callback that is
 * called after the SSG is complete, which allows for custom post-processing of the complete build
 * results.
 *
 * @public
 */
export function viteAdapter(opts: ViteAdapterPluginOptions) {
  let qwikRouterPlugin: QwikRouterPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let renderModulePath: string | null = null;
  let qwikRouterConfigModulePath: string | null = null;
  let isSsrBuild = false;
  const outputEntries: string[] = [];

  const plugin: Plugin<never> = {
    name: `vite-plugin-qwik-router-ssg-${opts.name}`,
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
        qwikRouterPlugin = config.plugins.find(
          (p) => p.name === 'vite-plugin-qwik-router'
        ) as QwikRouterPlugin;
        if (!qwikRouterPlugin) {
          throw new Error('Missing vite-plugin-qwik-router');
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
      }
    },
    buildStart() {
      if (isSsrBuild && opts.ssg !== null) {
        const { srcDir } = qwikVitePlugin!.api!.getOptions()!;
        // TODO don't rely on entry points for SSG, somehow
        this.emitFile({
          id: '@qwik-router-config',
          type: 'chunk',
          fileName: '@qwik-router-config.js',
        });
        this.emitFile({
          id: `${srcDir}/entry.ssr`,
          type: 'chunk',
          fileName: 'entry.ssr.js',
        });
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
            } else if (chunk.name === '@qwik-router-config') {
              qwikRouterConfigModulePath = join(serverOutDir!, fileName);
            }
          }
        }
      }
    },

    closeBundle: {
      sequential: true,
      async handler() {
        if (isSsrBuild && serverOutDir && qwikRouterPlugin?.api && qwikVitePlugin?.api) {
          const staticPaths: string[] = opts.staticPaths || [];
          const routes = qwikRouterPlugin.api.getRoutes();
          const basePathname = qwikRouterPlugin.api.getBasePathname();
          const clientOutDir = qwikVitePlugin.api.getClientOutDir()!;
          const clientPublicOutDir = qwikVitePlugin.api.getClientPublicOutDir()!;
          const assetsDir = qwikVitePlugin.api.getAssetsDir();

          const rootDir = qwikVitePlugin.api.getRootDir() ?? undefined;
          if (
            opts.ssg !== null &&
            renderModulePath &&
            qwikRouterConfigModulePath &&
            clientOutDir &&
            clientPublicOutDir
          ) {
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
            } catch {
              this.warn(
                `Invalid "origin" option: "${ssgOrigin}". Using default origin: "https://yoursite.qwik.dev"`
              );
              ssgOrigin = `https://yoursite.qwik.dev`;
            }

            const staticGenerate = await import('../../../ssg');
            const generateOpts: StaticGenerateOptions = {
              maxWorkers: opts.maxWorkers,
              basePathname,
              outDir: clientPublicOutDir,
              rootDir,
              ...opts.ssg,
              origin: ssgOrigin,
              renderModulePath,
              qwikRouterConfigModulePath,
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
          }

          await postBuild(
            clientPublicOutDir,
            serverOutDir,
            assetsDir ? join(basePathname, assetsDir) : basePathname,
            staticPaths,
            !!opts.cleanStaticGenerated
          );

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
          if (opts.ssg !== null) {
            /**
             * HACK: for some reason the build hangs after SSG. `why-is-node-running` shows 4
             * culprits:
             *
             * ```
             * There are 4 handle(s) keeping the process running.
             *
             * # CustomGC
             * ./node_modules/.pnpm/lightningcss@1.30.1/node_modules/lightningcss/node/index.js:20 - module.exports = require(`lightningcss-${parts.join('-')}`);
             *
             * # CustomGC
             * ./node_modules/.pnpm/@tailwindcss+oxide@4.1.12/node_modules/@tailwindcss/oxide/index.js:229 - return require('@tailwindcss/oxide-linux-x64-gnu')
             *
             * # Timeout
             * node_modules/.vite-temp/vite.config.timestamp-1755270314169-a2a97ad5233f9.mjs:357
             * ./node_modules/.pnpm/vite@7.1.2_@types+node@24.3.0_jiti@2.5.1_lightningcss@1.30.1_terser@5.43.1_tsx@4.20.4_yaml@2.8.1/node_modules/vite/dist/node/chunks/dep-CMEinpL-.js:36657 - return (await import(pathToFileURL(tempFileName).href)).default;
             *
             * # CustomGC
             * ./packages/qwik/dist/optimizer.mjs:1328 - const mod2 = module.default.createRequire(import.meta.url)(`../bindings/${triple.platformArchABI}`);
             * ```
             *
             * For now, we'll force exit the process after SSG with some delay.
             */
            setTimeout(() => {
              process.exit(0);
            }, 5000).unref();
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
export interface AdapterSSGOptions extends Omit<SsgRenderOptions, 'outDir' | 'origin'> {
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
   * the Qwik Router config options.
   */
  origin?: string;
}
