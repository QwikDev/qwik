import type { PageModule, PathParams, QwikRouterConfig, RouteData } from '@qwik.dev/router';
import { bold, dim, green, magenta, red } from 'kleur/colors';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildErrorMessage } from 'vite';
import { formatError } from '../buildtime/vite/format-error';
import { msToString } from '../utils/format';
import { getPathnameForDynamicRoute } from '../utils/pathname';
import { createRouteTester } from './routes';
import type { SsgOptions, SsgResult, SsgRoute, System } from './types';

export async function mainThread(sys: System) {
  const opts = sys.getOptions();
  validateOptions(opts);

  const main = await sys.createMainProcess!();
  const log = await sys.createLogger();
  log.info('\n' + bold(green('Starting Qwik Router SSG...')));

  const qwikRouterConfig: QwikRouterConfig = (
    await import(pathToFileURL(opts.qwikRouterConfigModulePath).href)
  ).default;

  const queue: SsgRoute[] = [];
  const active = new Set<string>();
  const routes = qwikRouterConfig.routes;
  const trailingSlash = !!qwikRouterConfig.trailingSlash;
  const includeRoute = createRouteTester(opts.basePathname || '/', opts.include, opts.exclude);

  return new Promise<SsgResult>((resolve, reject) => {
    try {
      const timer = sys.createTimer();
      const generatorResult: SsgResult = {
        duration: 0,
        rendered: 0,
        errors: 0,
        staticPaths: [],
      };

      let isCompleted = false;
      let isRoutesLoaded = false;

      const completed = async () => {
        const closePromise = main.close();

        generatorResult.duration = timer();

        if (generatorResult.errors === 0) {
          log.info(`\n${green('SSG results')}`);
          if (generatorResult.rendered > 0) {
            log.info(
              `- Generated: ${dim(
                `${generatorResult.rendered} page${generatorResult.rendered === 1 ? '' : 's'}`
              )}`
            );
          }

          log.info(`- Duration: ${dim(msToString(generatorResult.duration))}`);

          const total = generatorResult.rendered + generatorResult.errors;
          if (total > 0) {
            log.info(
              `- Average: ${dim(msToString(generatorResult.duration / total) + ' per page')}`
            );
          }
          log.info(``);
        }

        closePromise
          .then(() => {
            setTimeout(() => resolve(generatorResult));
          })
          .catch(reject);
      };

      const next = () => {
        while (!isCompleted && main.hasAvailableWorker() && queue.length > 0) {
          const staticRoute = queue.shift();
          if (staticRoute) {
            render(staticRoute).catch((e) => {
              console.error(`render failed for ${staticRoute.pathname}`, e);
            });
          }
        }

        if (!isCompleted && isRoutesLoaded && queue.length === 0 && active.size === 0) {
          isCompleted = true;
          completed().catch((e) => {
            console.error('SSG completion failed', e);
          });
        }
      };

      let isPendingDrain = false;
      const flushQueue = () => {
        if (!isPendingDrain) {
          isPendingDrain = true;
          setTimeout(() => {
            isPendingDrain = false;
            next();
          });
        }
      };

      const render = async (staticRoute: SsgRoute) => {
        try {
          active.add(staticRoute.pathname);

          const result = await main.render({ type: 'render', ...staticRoute });

          active.delete(staticRoute.pathname);

          if (result.error) {
            const err = new Error(result.error.message);
            err.stack = result.error.stack;
            log.error(`\n${bold(red(`!!! ${result.pathname}: Error during SSG`))}`);
            log.error(red(err.message));
            log.error(`  Pathname: ${magenta(staticRoute.pathname)}`);
            Object.assign(formatError(err), {
              plugin: 'qwik-ssg',
            });
            log.error(buildErrorMessage(err));

            generatorResult.errors++;
          }

          if (result.filePath != null) {
            generatorResult.rendered++;
            generatorResult.staticPaths.push(result.pathname);
            const base = opts.rootDir ?? opts.outDir;
            const path = relative(base, result.filePath);
            const lastSlash = path.lastIndexOf('/');
            log.info(`${dim(path.slice(0, lastSlash + 1))}${path.slice(lastSlash + 1)}`);
          }

          flushQueue();
        } catch (e) {
          console.error(`render failed for ${staticRoute.pathname}`, e);
          isCompleted = true;
          reject(e);
        }
      };

      const addToQueue = (pathname: string | undefined | null, params: PathParams | undefined) => {
        if (pathname) {
          pathname = new URL(pathname, `https://qwik.dev`).pathname;

          if (pathname !== opts.basePathname) {
            if (trailingSlash) {
              if (!pathname.endsWith('/')) {
                const segments = pathname.split('/');
                const lastSegment = segments[segments.length - 1];

                if (!lastSegment.includes('.')) {
                  pathname += '/';
                }
              }
            } else {
              if (pathname.endsWith('/')) {
                pathname = pathname.slice(0, pathname.length - 1);
              }
            }
          }

          if (includeRoute(pathname) && !queue.some((s) => s.pathname === pathname)) {
            queue.push({
              pathname,
              params,
            });
            flushQueue();
          }
        }
      };

      /**
       * Traverse the route tree and call the callback for each route that has module loaders.
       * Reconstructs the original pathname and param names from the tree path. Accumulates _L
       * layout loaders from ancestors during traversal.
       */
      const traverseRouteTree = async (
        node: RouteData,
        pathParts: string[],
        basePathname: string,
        ancestorLoaders: (() => Promise<any>)[]
      ) => {
        // Accumulate this node's layout loader
        const currentLoaders = node._L
          ? [...ancestorLoaders, node._L as () => Promise<any>]
          : ancestorLoaders;

        // Check if this node has an index (_I) — that means it's a page
        const index = node._I;
        if (index) {
          const pageLoaders = Array.isArray(index)
            ? (index as (() => Promise<any>)[])
            : [...currentLoaders, index as () => Promise<any>];

          // Reconstruct the original pathname from path parts
          const originalPathname = basePathname + pathParts.join('/') + '/';
          const paramNames = pathParts
            .filter((p) => p.startsWith('[') && p.endsWith(']'))
            .map((p) => (p.startsWith('[...') ? p.slice(4, -1) : p.slice(1, -1)));

          // Load all modules (last one is the page module)
          const modules = await Promise.all(
            pageLoaders
              .filter((l): l is () => Promise<any> => typeof l === 'function')
              .map((l) => l())
          );
          const pageModule: PageModule = modules[modules.length - 1] as any;

          if (paramNames.length > 0) {
            if (typeof pageModule.onStaticGenerate === 'function') {
              const staticGenerate = await pageModule.onStaticGenerate({
                env: {
                  get(key: string) {
                    return sys.getEnv(key);
                  },
                },
              });
              if (Array.isArray(staticGenerate.params)) {
                for (const params of staticGenerate.params) {
                  const pathname = getPathnameForDynamicRoute(originalPathname, paramNames, params);
                  addToQueue(pathname, params);
                }
              }
            }
          } else {
            addToQueue(originalPathname, undefined);
          }
        }

        // Recurse into group nodes (_M array)
        if (node._M) {
          for (const group of node._M as RouteData[]) {
            await traverseRouteTree(group, pathParts, basePathname, currentLoaders);
          }
        }

        // Recurse into _W (wildcard) and _A (rest) child nodes
        if (node._W && typeof node._W === 'object') {
          const childNode = node._W as RouteData;
          const paramName = childNode._P as string | undefined;
          const pathPart = paramName ? `[${paramName}]` : '[param]';
          await traverseRouteTree(
            childNode,
            [...pathParts, pathPart],
            basePathname,
            currentLoaders
          );
        }
        if (node._A && typeof node._A === 'object') {
          const childNode = node._A as RouteData;
          const paramName = childNode._P as string | undefined;
          const pathPart = paramName ? `[...${paramName}]` : '[...rest]';
          await traverseRouteTree(
            childNode,
            [...pathParts, pathPart],
            basePathname,
            currentLoaders
          );
        }

        // Recurse into regular child nodes (skip metadata keys starting with '_')
        for (const [key, child] of Object.entries(node)) {
          if (key.charCodeAt(0) === 95 /* '_' */) {
            continue;
          }
          const childNode = child as RouteData;
          await traverseRouteTree(childNode, [...pathParts, key], basePathname, currentLoaders);
        }
      };

      const loadStaticRoutes = async () => {
        const basePathname = opts.basePathname || '/';
        await traverseRouteTree(routes, [], basePathname, []);
        isRoutesLoaded = true;
        flushQueue();
      };

      loadStaticRoutes().catch((e) => {
        console.error('SSG route loading failed', e);
        reject(e);
      });
    } catch (e) {
      console.error('SSG main thread failed', e);
      reject(e);
    }
  });
}

function validateOptions(opts: SsgOptions) {
  if (!opts.qwikRouterConfigModulePath) {
    if (!opts.qwikCityPlanModulePath) {
      throw new Error(`Missing "qwikRouterConfigModulePath" option`);
    } else {
      console.warn(
        '`qwikCityPlanModulePath` is deprecated. Use `qwikRouterConfigModulePath` instead.'
      );
    }
  }
  if (!opts.renderModulePath) {
    throw new Error(`Missing "renderModulePath" option`);
  }

  let siteOrigin = opts.origin;
  if (typeof siteOrigin !== 'string' || siteOrigin.trim().length === 0) {
    throw new Error(`Missing "origin" option`);
  }
  siteOrigin = siteOrigin.trim();
  if (!/:\/\//.test(siteOrigin) || siteOrigin.startsWith('://')) {
    throw new Error(
      `"origin" must start with a valid protocol, such as "https://" or "http://", received "${siteOrigin}"`
    );
  }
  try {
    new URL(siteOrigin);
  } catch (e) {
    throw new Error(`Invalid "origin"`, { cause: e as Error });
  }
}
