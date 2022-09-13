import type { StaticGeneratorOptions, StaticGeneratorResults, StaticRoute, System } from './types';
import { msToString } from '../../utils/format';
import { getPathnameForDynamicRoute, normalizePathname } from '../../utils/pathname';
import type { PageModule, RouteParams } from '../../runtime/src/library/types';
import { routes, trailingSlash, basePathname } from '@qwik-city-plan';

export async function mainThread(sys: System) {
  const opts = sys.getOptions();
  validateOptions(opts);

  const main = await sys.createMainProcess();
  const log = await sys.createLogger();
  const queue: StaticRoute[] = [];
  const active = new Set<string>();
  const task = Promise.resolve();

  return new Promise<StaticGeneratorResults>((resolve, reject) => {
    try {
      const timer = sys.createTimer();
      const generatorResults: StaticGeneratorResults = {
        duration: 0,
        rendered: 0,
        errors: 0,
      };

      let isCompleted = false;
      let isRoutesLoaded = false;

      const next = () => {
        while (!isCompleted && main.hasAvailableWorker() && queue.length > 0) {
          const staticRoute = queue.shift();
          if (staticRoute) {
            render(staticRoute);
          }
        }

        if (!isCompleted && isRoutesLoaded && queue.length === 0 && active.size === 0) {
          isCompleted = true;

          generatorResults.duration = timer();

          log.info(
            `Generated: ${generatorResults.rendered} page${
              generatorResults.rendered === 1 ? '' : 's'
            }`
          );

          log.info(`Duration: ${msToString(generatorResults.duration)}`);

          if (generatorResults.rendered > 0) {
            log.info(
              `Average: ${msToString(
                generatorResults.duration / generatorResults.rendered
              )} per page`
            );
          }

          if (generatorResults.errors > 0) {
            log.info(`errors: ${generatorResults.errors}`);
          }
          log.info(``);

          main
            .close()
            .then(() => {
              setTimeout(() => resolve(generatorResults));
            })
            .catch(reject);
        }
      };

      let isPendingDrain = false;
      const flushQueue = () => {
        if (!isPendingDrain) {
          isPendingDrain = true;
          task.then(() => {
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
            log.error(staticRoute.pathname, result.error);
            generatorResults.errors++;
          } else if (result.ok) {
            generatorResults.rendered++;
            log.debug(`  ${staticRoute.pathname}`);
          }

          flushQueue();
        } catch (e) {
          isCompleted = true;
          reject(e);
        }
      };

      const addToQueue = (pathname: string | undefined | null, params: RouteParams | undefined) => {
        pathname = normalizePathname(pathname, basePathname, trailingSlash);
        if (pathname && !queue.some((s) => s.pathname === pathname)) {
          queue.push({
            pathname,
            params,
          });
          flushQueue();
        }
      };

      const loadStaticRoutes = async () => {
        await Promise.all(
          routes.map(async (route) => {
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
          })
        );

        isRoutesLoaded = true;

        flushQueue();
      };

      loadStaticRoutes();
    } catch (e) {
      reject(e);
    }
  });
}

function validateOptions(opts: StaticGeneratorOptions) {
  let siteOrigin = opts.origin;
  if (typeof siteOrigin !== 'string' || siteOrigin.trim().length === 0) {
    throw new Error(`Missing "origin" option`);
  }
  siteOrigin = siteOrigin.trim();
  if (!siteOrigin.startsWith('https://') && !siteOrigin.startsWith('http://')) {
    throw new Error(`"origin" must start with a valid protocol, such as "https://" or "http://"`);
  }
  try {
    new URL(siteOrigin);
  } catch (e) {
    throw new Error(`Invalid "origin": ${e}`);
  }
}
