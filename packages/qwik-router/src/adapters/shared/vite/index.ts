import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { StaticGenerateOptions, SsgRenderOptions } from 'packages/qwik-router/src/ssg';
import type { QwikRouterPlugin } from '@qwik.dev/router/vite';
import { spawn } from 'node:child_process';
import { readFile, rm, unlink } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { type Plugin, type UserConfig, type ViteBuilder } from 'vite';
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
const QWIK_SSG_WORKER_ENTRY_ID = '@qwik-ssg-worker-entry';
const QWIK_SSG_WORKER_ENTRY_RESOLVED = '\0@qwik-ssg-worker-entry';

/** @public */
export function viteAdapter(opts: ViteAdapterPluginOptions) {
  let qwikRouterPlugin: QwikRouterPlugin | null = null;
  let qwikVitePlugin: QwikVitePlugin | null = null;
  let viteCommand: string | undefined;
  let buildAppRan = false;
  const outputEntries: string[] = [];

  // Throwaway outDir for the `ssg` environment's run-ssg output. Kept inside the build root so Vite
  // can empty it and run-ssg resolves externalized node_modules deps at render time. A pure function
  // of (root, pid) so the `config` and `buildApp` hooks derive the same path without shared state.
  const ssgOutDirFor = (root: string) =>
    join(resolve(root), 'node_modules', '.cache', `qwik-router-ssg-${process.pid}`);

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
      // Setting `builder` switches this build to Vite's multi-environment app build, orchestrated
      // in `buildApp`. Always on: post-build and the adapter `generate()` must run there even when
      // SSG is disabled.
      config.builder ??= {};
      if (opts.ssg !== null) {
        // Render SSG in a dedicated `ssg` server environment — its own build graph — so run-ssg's
        // `()=>import()` route loaders never enter the deployed (`ssr`) bundle.
        config.environments = {
          ...config.environments,
          // Same server externalization as `ssr` (via the router/qwik `configEnvironment` hooks);
          // only the build graph and outDir differ. run-ssg externalizes node_modules deps and
          // resolves them at render time, so native/CJS packages (e.g. a database client) are not
          // force-bundled.
          ssg: {
            consumer: 'server',
            build: {
              ssr: true,
              outDir: ssgOutDirFor(config.root ?? process.cwd()),
              emptyOutDir: true,
              // Throwaway output, executed once and deleted — skip minify/sourcemap work.
              minify: false,
              sourcemap: false,
            },
          },
        };
      }
      return config;
    },

    configEnvironment(name, environmentOptions) {
      if (name === 'ssg') {
        // The ssg graph only builds the run-ssg entries emitted in `buildStart`; drop the
        // inherited deploy entry so it is not bundled a second time. Replace the containers —
        // the inherited objects are shared by reference with the top-level (ssr) config.
        environmentOptions.build = {
          ...environmentOptions.build,
          rollupOptions: { ...environmentOptions.build?.rollupOptions, input: {} },
        };
      }
    },

    configResolved(config) {
      viteCommand = config.command;

      qwikRouterPlugin = config.plugins.find(
        (p) => p.name === 'vite-plugin-qwik-router'
      ) as QwikRouterPlugin;
      if (!qwikRouterPlugin) {
        throw new Error('Missing vite-plugin-qwik-router');
      }
      // Hand the SSG set to the router for the server-route prune (see `_setSsgRoutes`).
      qwikRouterPlugin.api?._setSsgRoutes?.(opts.ssg?.include, opts.ssg?.exclude);
      // Use double type assertion to avoid TS "Excessive stack depth comparing types" error
      // when comparing QwikVitePlugin with Plugin types
      qwikVitePlugin = config.plugins.find(
        (p) => p.name === 'vite-plugin-qwik'
      ) as any as QwikVitePlugin;
      if (!qwikVitePlugin) {
        throw new Error('Missing vite-plugin-qwik');
      }
    },

    resolveId(id) {
      if (id === QWIK_SSG_ENTRY_ID) {
        return QWIK_SSG_ENTRY_RESOLVED;
      }
      if (id === QWIK_SSG_WORKER_ENTRY_ID) {
        return QWIK_SSG_WORKER_ENTRY_RESOLVED;
      }
    },

    load(id) {
      if (id === QWIK_SSG_WORKER_ENTRY_RESOLVED) {
        // Worker entry: imports `render` + the full route plan.
        const { srcDir } = qwikVitePlugin!.api!.getOptions()!;
        return [
          `import render from '${srcDir}/entry.ssr';`,
          `import qwikRouterConfig from '@qwik-router-config';`,
          `import { startWorker } from '@qwik.dev/router/ssg';`,
          // Fire-and-forget (no top-level await): avoids an inlined-dynamic-import init-order
          // bug on the SSR target (see rollup/rollup#4166).
          `startWorker({ render, qwikRouterConfig }).catch((err) => {`,
          `  console.error(err);`,
          `  process.exit(1);`,
          `});`,
        ].join('\n');
      }

      if (id !== QWIK_SSG_ENTRY_RESOLVED) {
        return;
      }

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

      // Main entry: enumerates routes and drives the worker pool; no `render` import.
      return [
        `import qwikRouterConfig from '@qwik-router-config';`,
        `import { runSsg } from '@qwik.dev/router/ssg';`,
        ``,
        `const ssgOpts = ${JSON.stringify(ssgOpts)};`,
        ``,
        `// Parse --quiet / --debug CLI flags`,
        `const args = process.argv.slice(2);`,
        `if (args.includes('--quiet')) ssgOpts.log = 'quiet';`,
        `if (args.includes('--debug')) ssgOpts.log = 'debug';`,
        ``,
        // Fire-and-forget; see rollup/rollup#4166 above. The worker entry is a sibling file.
        `runSsg({`,
        `  qwikRouterConfig,`,
        `  workerFilePath: new URL('./run-ssg-worker.js', import.meta.url).href,`,
        `  ...ssgOpts,`,
        `}).catch((err) => {`,
        `  console.error(err);`,
        `  process.exit(1);`,
        `});`,
      ].join('\n');
    },

    buildStart() {
      // Emit both SSG entries in the `ssg` environment only (never the deployed `ssr` build). The
      // worker entry renders and owns the render graph; the main entry only orchestrates — two
      // entries keep the graphs from folding together.
      if (this.environment.name === 'ssg' && viteCommand === 'build') {
        this.emitFile({ id: QWIK_SSG_ENTRY_ID, type: 'chunk', fileName: 'run-ssg.js' });
        this.emitFile({
          id: QWIK_SSG_WORKER_ENTRY_ID,
          type: 'chunk',
          fileName: 'run-ssg-worker.js',
        });
      }
    },

    generateBundle(_, bundles) {
      // Capture the deployed entries (the `ssr` environment), not the throwaway `ssg` output.
      if (this.environment.name === 'ssr') {
        outputEntries.length = 0;
        for (const fileName in bundles) {
          const chunk = bundles[fileName];
          if (chunk.type === 'chunk' && chunk.isEntry) {
            outputEntries.push(fileName);
          }
        }
        // SSG runs only from `buildApp` (the multi-environment app build). If the deployed server was
        // built directly via Vite's programmatic `build()`, buildApp never ran and nothing was
        // prerendered — warn loudly rather than silently shipping an un-prerendered site.
        if (opts.ssg !== null && viteCommand === 'build' && !buildAppRan) {
          this.warn(
            'Qwik Router SSG was skipped: the `ssr` environment was built directly instead of through ' +
              'the Vite app builder, so no pages were prerendered. Build with the Qwik CLI or ' +
              '`createBuilder(config).buildApp()` (a plain `vite build` does this automatically).'
          );
        }
      }
    },

    // Build the deployed server (`ssr`) and the separate `ssg` graph (run-ssg) — two graphs, so
    // prerendered route code never reaches the `ssr` bundle — then render the pages and post-build.
    // (The client builds in its own `vite build`.)
    async buildApp(builder: ViteBuilder) {
      buildAppRan = true;
      const ssr = builder.environments.ssr;
      if (ssr) {
        await builder.build(ssr);
      }
      // Read the deployed server outDir from the `ssr` environment, not a closure: in builder mode
      // `configResolved` runs per environment, so the later `ssg` build would clobber a shared value.
      const serverOutDir = ssr?.config.build.outDir;
      if (!serverOutDir || !qwikRouterPlugin?.api || !qwikVitePlugin?.api) {
        return;
      }

      const log = builder.config.logger;
      const staticPaths: string[] = opts.staticPaths || [];
      const routes = qwikRouterPlugin.api.getRoutes();
      const basePathname = qwikRouterPlugin.api.getBasePathname();
      const clientOutDir = qwikVitePlugin.api.getClientOutDir()!;
      const clientPublicOutDir = qwikVitePlugin.api.getClientPublicOutDir()!;
      const ssgEnv = builder.environments.ssg;
      const ssgOutDir = ssgOutDirFor(builder.config.root);

      if (ssgEnv && clientOutDir && clientPublicOutDir) {
        await builder.build(ssgEnv);

        // Spawn run-ssg as a child process to isolate the SSG worker-thread handles from the build.
        const runSsgPath = join(ssgOutDir, 'run-ssg.js');
        const ssgExitCode = await new Promise<number | null>((res, reject) => {
          const child = spawn(process.execPath, [runSsgPath], {
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
          });
          child.on('close', res);
          child.on('error', reject);
        });
        if (ssgExitCode !== 0) {
          throw new Error(
            `Error while running SSG from "${opts.name}" adapter. At least one path failed to render.`
          );
        }

        // Read (and remove) the static paths written by run-ssg.js, then drop the throwaway dir.
        const staticPathsFile = join(clientPublicOutDir, '_static-paths.json');
        try {
          staticPaths.push(...JSON.parse(await readFile(staticPathsFile, 'utf-8')));
          await unlink(staticPathsFile);
        } catch {
          // No static paths file — SSG may have produced no pages.
        }
        // Set QWIK_ROUTER_KEEP_SSG_BUILD to keep the throwaway run-ssg build for debugging.
        if (process.env.QWIK_ROUTER_KEEP_SSG_BUILD) {
          log.warn(`SSG build kept at ${ssgOutDir}`);
        } else {
          await rm(ssgOutDir, { recursive: true, force: true });
        }
      }

      await postBuild(
        clientPublicOutDir,
        serverOutDir,
        basePathname,
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
          warn: (message) => log.warn(message),
          error: (message) => {
            throw new Error(message);
          },
        });
      }

      log.warn(
        `\n==============================================` +
          `\nNote: Make sure that you are serving the built files with proper cache headers.` +
          `\nSee https://qwik.dev/docs/deployments/#cache-headers for more information.` +
          `\n==============================================`
      );
    },
  };

  return [plugin];
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
