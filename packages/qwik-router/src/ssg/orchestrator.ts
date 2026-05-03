import type { PageModule, PathParams, RouteData } from '@qwik.dev/router';
import { bold, dim, green, magenta, red } from 'kleur/colors';
import { relative } from 'node:path';
import { msToString } from '../utils/format';
import { ensureSlash, getPathnameForDynamicRoute } from '../utils/pathname';
import { createRouteTester } from './routes';
import type { SsgGenerateOptions, SsgResult, SsgRoute, System } from './types';

export async function mainThread(sys: System) {
  const opts = sys.getOptions();
  validateOptions(opts);

  const main = await sys.createMainProcess!();
  const log = await sys.createLogger();
  log.info('\n' + bold(green('Starting Qwik Router SSG...')));

  const qwikRouterConfig = opts.qwikRouterConfig;
  const renderTimeout = 30_000;

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
          log.debug(`render start: ${staticRoute.pathname}`);

          const result = await Promise.race([
            main.render({ type: 'render', ...staticRoute }),
            new Promise<never>((_, reject) =>
              setTimeout(
                () => reject(new Error(`SSG render timed out after ${renderTimeout}ms`)),
                renderTimeout
              )
            ),
          ]);

          active.delete(staticRoute.pathname);
          log.debug(`render done: ${staticRoute.pathname}`);

          if (result.error) {
            const err = new Error(result.error.message);
            err.stack = result.error.stack;
            log.error(`\n${bold(red(`!!! ${result.pathname}: Error during SSG`))}`);
            log.error(red(err.message));
            log.error(`  Pathname: ${magenta(staticRoute.pathname)}`);
            if (err.stack) {
              log.error(dim(err.stack));
            }

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
                  pathname = ensureSlash(pathname);
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
          const joinedParts = pathParts.join('/');
          const originalPathname = basePathname + (joinedParts ? ensureSlash(joinedParts) : '');
          const paramNames = pathParts
            .filter((p) => p.startsWith('[') && p.endsWith(']'))
            .map((p) => (p.startsWith('[...') ? p.slice(4, -1) : p.slice(1, -1)));

          if (paramNames.length === 0) {
            addToQueue(originalPathname, undefined);
          } else {
            // Only the page module can provide onStaticGenerate, so avoid importing layouts or
            // static pages during discovery. This keeps SSG from stalling on unrelated loaders.
            const pageLoader = pageLoaders[pageLoaders.length - 1];
            if (typeof pageLoader === 'function') {
              const pageModule: PageModule = await pageLoader();

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
                    const pathname = getPathnameForDynamicRoute(
                      originalPathname,
                      paramNames,
                      params
                    );
                    addToQueue(pathname, params);
                  }
                }
              }
            }
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
        log.debug('traversing route tree...');
        // The route trie already contains any configured base pathname segments, so reconstruct
        // discovered paths from "/" to avoid prefixing the base twice.
        await traverseRouteTree(routes, [], '/', []);
        log.debug(`route tree traversed, ${queue.length} routes queued, ${active.size} active`);
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

function validateOptions(opts: SsgGenerateOptions) {
  if (!opts.render) {
    throw new Error(`Missing "render" option`);
  }
  if (!opts.qwikRouterConfig) {
    throw new Error(`Missing "qwikRouterConfig" option`);
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
