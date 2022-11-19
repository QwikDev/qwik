import type { PageModule, QwikCityPlan, RouteData, RouteParams } from '../runtime/src/types';
import type { StaticGenerateOptions, StaticGenerateResult, StaticRoute, System } from './types';
import { msToString } from '../utils/format';
import { generateNotFoundPages } from './not-found';
import { getPathnameForDynamicRoute } from '../utils/pathname';
import { pathToFileURL } from 'node:url';

export async function mainThread(sys: System) {
  const opts = sys.getOptions();
  validateOptions(opts);

  const main = await sys.createMainProcess();
  const log = await sys.createLogger();
  const qwikCityPlan: QwikCityPlan = (await import(pathToFileURL(opts.qwikCityPlanModulePath).href))
    .default;

  const queue: StaticRoute[] = [];
  const active = new Set<string>();
  const routes = qwikCityPlan.routes || [];
  const trailingSlash = !!qwikCityPlan.trailingSlash;

  return new Promise<StaticGenerateResult>((resolve, reject) => {
    try {
      const timer = sys.createTimer();
      const generatorResult: StaticGenerateResult = {
        duration: 0,
        rendered: 0,
        errors: 0,
        staticPaths: [],
      };

      let isCompleted = false;
      let isRoutesLoaded = false;

      const completed = async () => {
        const closePromise = main.close();

        await generateNotFoundPages(sys, opts, routes);

        generatorResult.duration = timer();

        log.info('\nSSG results');
        if (generatorResult.rendered > 0) {
          log.info(
            `- Generated: ${generatorResult.rendered} page${
              generatorResult.rendered === 1 ? '' : 's'
            }`
          );
        }

        if (generatorResult.errors > 0) {
          log.info(`- Errors: ${generatorResult.errors}`);
        }

        log.info(`- Duration: ${msToString(generatorResult.duration)}`);

        const total = generatorResult.rendered + generatorResult.errors;
        if (total > 0) {
          log.info(`- Average: ${msToString(generatorResult.duration / total)} per page`);
        }

        log.info(``);

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
            render(staticRoute);
          }
        }

        if (!isCompleted && isRoutesLoaded && queue.length === 0 && active.size === 0) {
          isCompleted = true;
          completed();
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

      const render = async (staticRoute: StaticRoute) => {
        try {
          active.add(staticRoute.pathname);

          const result = await main.render({ type: 'render', ...staticRoute });

          active.delete(staticRoute.pathname);

          if (result.error) {
            log.error(
              `ERROR: SSG failed for path: ${staticRoute.pathname}\n`,
              result.error,
              '\n\n'
            );
            generatorResult.errors++;
          } else if (result.ok) {
            generatorResult.rendered++;
            if (result.isStatic) {
              generatorResult.staticPaths.push(result.pathname);
            }
          }

          flushQueue();
        } catch (e) {
          isCompleted = true;
          reject(e);
        }
      };

      const addToQueue = (pathname: string | undefined | null, params: RouteParams | undefined) => {
        if (pathname) {
          pathname = new URL(pathname, `https://qwik.builder.io`).pathname;

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

          if (!queue.some((s) => s.pathname === pathname)) {
            queue.push({
              pathname,
              params,
            });
            flushQueue();
          }
        }
      };

      const loadStaticRoute = async (route: RouteData) => {
        const [_, loaders, paramNames, originalPathname] = route;
        const modules = await Promise.all(loaders.map((loader) => loader()));
        const pageModule: PageModule = modules[modules.length - 1] as any;

        if (pageModule.default) {
          // page module (not an endpoint)

          if (Array.isArray(paramNames) && paramNames.length > 0) {
            if (typeof pageModule.onStaticGenerate === 'function' && paramNames.length > 0) {
              // dynamic route page module
              const staticGenerate = await pageModule.onStaticGenerate();
              if (Array.isArray(staticGenerate.params)) {
                for (const params of staticGenerate.params) {
                  const pathname = getPathnameForDynamicRoute(
                    originalPathname!,
                    paramNames,
                    params
                  );
                  addToQueue(pathname, params);
                }
              }
            }
          } else {
            // static route page module
            addToQueue(originalPathname, undefined);
          }
        }
      };

      const loadStaticRoutes = async () => {
        await Promise.all(routes.map(loadStaticRoute));
        isRoutesLoaded = true;
        flushQueue();
      };

      loadStaticRoutes();
    } catch (e) {
      reject(e);
    }
  });
}

function validateOptions(opts: StaticGenerateOptions) {
  if (!opts.qwikCityPlanModulePath) {
    throw new Error(`Missing "qwikCityPlanModulePath" option`);
  }
  if (!opts.renderModulePath) {
    throw new Error(`Missing "renderModulePath" option`);
  }

  let siteOrigin = opts.origin;
  if (typeof siteOrigin !== 'string' || siteOrigin.trim().length === 0) {
    throw new Error(`Missing "origin" option`);
  }
  siteOrigin = siteOrigin.trim();
  if (!siteOrigin.startsWith('https://') && !siteOrigin.startsWith('http://')) {
    throw new Error(
      `"origin" must start with a valid protocol, such as "https://" or "http://", received "${siteOrigin}"`
    );
  }
  try {
    new URL(siteOrigin);
  } catch (e) {
    throw new Error(`Invalid "origin": ${e}`);
  }
}
