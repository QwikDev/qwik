import type { StaticGeneratorOptions, StaticGeneratorResults, System } from './types';
import { msToString, normalizePathname } from './utils';

export async function mainThread(sys: System) {
  const opts = sys.getOptions();
  const main = await sys.createMainProcess();
  const log = await sys.createLogger();
  const pending = await getInitialPathnames(opts);

  return new Promise<StaticGeneratorResults>((resolve, reject) => {
    try {
      const timer = sys.createTimer();
      const generatorResults: StaticGeneratorResults = {
        duration: 0,
        rendered: 0,
        errors: 0,
        urls: 0,
      };

      const active = new Set<string>();
      const completed = new Set<string>();
      let isResolved = false;

      const next = () => {
        if (!isResolved) {
          while (main.hasAvailableWorker() && pending.length > 0 && !isResolved) {
            render();
          }

          if (pending.length === 0 && active.size === 0 && !isResolved) {
            isResolved = true;

            generatorResults.urls = completed.size;
            generatorResults.duration = timer();

            log.info(
              `Rendered: ${generatorResults.rendered} page${
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

            main
              .close()
              .then(() => resolve(generatorResults))
              .catch(reject);
          }
        }
      };

      const render = async () => {
        try {
          if (isResolved) {
            return;
          }

          const pathname = pending.shift();
          if (!pathname) {
            return;
          }

          active.add(pathname);

          const result = await main.render({ pathname });

          for (const p of result.links) {
            if (!pending.includes(p) && !active.has(p) && !completed.has(p)) {
              pending.push(p);
            }
          }

          if (result.error) {
            log.error(pathname, result.error);
            generatorResults.errors++;
          } else if (result.ok) {
            generatorResults.rendered++;
            log.debug(`  ${pathname}`);
          }

          active.delete(pathname);
          completed.add(pathname);

          setTimeout(next);
        } catch (e) {
          isResolved = true;
          reject(e);
        }
      };

      setTimeout(next);
    } catch (e) {
      reject(e);
    }
  });
}

async function getInitialPathnames(opts: StaticGeneratorOptions) {
  const baseUrl = new URL(opts.baseUrl);

  if (typeof opts.urlLoader === 'function') {
    const initialPathnames: string[] = [];
    const urls = await opts.urlLoader();
    if (Array.isArray(urls)) {
      for (const url of urls) {
        const pathname = normalizePathname(url, baseUrl);
        if (pathname && !initialPathnames.includes(pathname)) {
          initialPathnames.push(pathname);
        }
      }
    }
    return initialPathnames;
  }

  return [baseUrl.pathname];
}
