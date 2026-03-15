import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { StaticGenerateOptions, SsgRenderOptions } from 'packages/qwik-router/src/ssg';
import type { QwikRouterPlugin } from '@qwik.dev/router/vite';
import { basename, dirname, join, resolve } from 'node:path';
import type { Plugin, UserConfig } from 'vite';
import type { BuiltRoute } from '../../../buildtime/types';
import { postBuild } from './post-build';

/**
 * Implements the SSG after the build is complete. Also provides a `generate(...)` callback that is
 * called after the SSG is complete, which allows for custom post-processing of the complete build
 * results.
 *
 * @public
 */
const QWIK_SSG_ENTRY_ID = '@qwik-ssg-entry';
const QWIK_SSG_ENTRY_RESOLVED = '\0@qwik-ssg-entry';

/** @public */
export function viteAdapter(opts: ViteAdapterPluginOptions) {
  let qwikRouterPlugin: QwikRouterPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let serverOutDir: string | null = null;
  let viteCommand: string | undefined;
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
      viteCommand = config.command;

      qwikRouterPlugin = config.plugins.find(
        (p) => p.name === 'vite-plugin-qwik-router'
      ) as QwikRouterPlugin;
      if (!qwikRouterPlugin) {
        throw new Error('Missing vite-plugin-qwik-router');
      }
      // Use double type assertion to avoid TS "Excessive stack depth comparing types" error
      // when comparing QwikVitePlugin with Plugin types
      qwikVitePlugin = config.plugins.find(
        (p) => p.name === 'vite-plugin-qwik'
      ) as any as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
      serverOutDir = config.build.outDir;
    },

    resolveId(id) {
      if (id === QWIK_SSG_ENTRY_ID) {
        return QWIK_SSG_ENTRY_RESOLVED;
      }
    },

    load(id) {
      if (id !== QWIK_SSG_ENTRY_RESOLVED) {
        return;
      }

      const { srcDir } = qwikVitePlugin!.api!.getOptions()!;
      const clientPublicOutDir = qwikVitePlugin!.api!.getClientPublicOutDir()!;
      const basePathname = qwikRouterPlugin!.api!.getBasePathname();
      const rootDir = qwikVitePlugin!.api!.getRootDir() ?? undefined;

      let ssgOrigin = opts.ssg?.origin ?? opts.origin;
      if (!ssgOrigin) {
        ssgOrigin = `https://yoursite.qwik.dev`;
      }
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

      // Build the SSG options to bake into run-ssg.js
      const ssgOpts: Omit<StaticGenerateOptions, 'render' | 'qwikRouterConfig'> = {
        origin: ssgOrigin,
        outDir: clientPublicOutDir,
        basePathname,
        rootDir,
        ...opts.ssg,
        maxWorkers: opts.maxWorkers,
      };
      for (const key of Object.keys(ssgOpts) as (keyof typeof ssgOpts)[]) {
        if (ssgOpts[key] === undefined) {
          delete ssgOpts[key];
        }
      }

      // Virtual module that serves as both main and worker entry.
      // Vite bundles the entry.ssr and @qwik-router-config imports.
      // @qwik.dev/router/ssg is kept external (dynamic import).
      return [
        `import { isMainThread } from 'node:worker_threads';`,
        `import render from '${srcDir}/entry.ssr';`,
        `import qwikRouterConfig from '@qwik-router-config';`,
        ``,
        `const ssgOpts = ${JSON.stringify(ssgOpts)};`,
        ``,
        `if (isMainThread) {`,
        `  const { runSsg } = await import('@qwik.dev/router/ssg');`,
        `  await runSsg({`,
        `    render,`,
        `    qwikRouterConfig,`,
        `    workerFilePath: new URL(import.meta.url).href,`,
        `    ...ssgOpts,`,
        `  });`,
        `} else {`,
        `  const { startWorker } = await import('@qwik.dev/router/ssg');`,
        `  await startWorker({ render, qwikRouterConfig });`,
        `}`,
      ].join('\n');
    },

    buildStart() {
      if (
        this.environment.config.consumer === 'server' &&
        opts.ssg !== null &&
        viteCommand === 'build' &&
        serverOutDir
      ) {
        this.emitFile({
          id: QWIK_SSG_ENTRY_ID,
          type: 'chunk',
          fileName: 'run-ssg.js',
        });
      }
    },
    generateBundle(_, bundles) {
      if (this.environment.config.consumer === 'server') {
        outputEntries.length = 0;

        for (const fileName in bundles) {
          const chunk = bundles[fileName];
          if (chunk.type === 'chunk' && chunk.isEntry) {
            outputEntries.push(fileName);
          }
        }
      }
    },

    closeBundle: {
      sequential: true,
      async handler() {
        if (
          this.environment.config.consumer === 'server' &&
          serverOutDir &&
          qwikRouterPlugin?.api &&
          qwikVitePlugin?.api
        ) {
          const staticPaths: string[] = opts.staticPaths || [];
          const routes = qwikRouterPlugin.api.getRoutes();
          const basePathname = qwikRouterPlugin.api.getBasePathname();
          const clientOutDir = qwikVitePlugin.api.getClientOutDir()!;
          const clientPublicOutDir = qwikVitePlugin.api.getClientPublicOutDir()!;
          const assetsDir = qwikVitePlugin.api.getAssetsDir();

          if (opts.ssg !== null && clientOutDir && clientPublicOutDir) {
            // run-ssg.js was emitted and bundled by Vite — spawn it as a child process
            // to isolate worker thread handles from the build process
            const runSsgPath = join(serverOutDir, 'run-ssg.js');
            const { spawn } = await import('node:child_process');

            const ssgExitCode = await new Promise<number | null>((resolve, reject) => {
              const child = spawn(process.execPath, [runSsgPath], {
                stdio: ['ignore', 'inherit', 'inherit'],
                env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
              });
              child.on('close', resolve);
              child.on('error', reject);
            });

            if (ssgExitCode !== 0) {
              const err = new Error(
                `Error while running SSG from "${opts.name}" adapter. At least one path failed to render.`
              );
              err.stack = undefined;
              this.error(err);
            }

            // Read static paths written by run-ssg.js
            const fs = await import('node:fs');
            const staticPathsFile = join(clientPublicOutDir, '_static-paths.json');
            try {
              const content = await fs.promises.readFile(staticPathsFile, 'utf-8');
              staticPaths.push(...JSON.parse(content));
              // Clean up the temporary file
              await fs.promises.unlink(staticPathsFile);
            } catch {
              // No static paths file — SSG may have produced no pages
            }
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
    routes: BuiltRoute[];
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
