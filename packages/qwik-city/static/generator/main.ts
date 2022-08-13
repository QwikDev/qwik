import type {
  Logger,
  MainContext,
  NormalizedStaticGeneratorOptions,
  StaticGeneratorResults,
  System,
} from './types';

export async function main(
  opts: NormalizedStaticGeneratorOptions,
  log: Logger,
  main: MainContext,
  sys: System
) {
  const pending: string[] = [];
  if (typeof opts.urlLoader === 'function') {
    (await opts.urlLoader()).forEach((url) => {
      pending.push(new URL(url, opts.baseUrl).pathname);
    });
  } else {
    pending.push(new URL(opts.baseUrl).pathname);
  }

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

      const renderNext = () => {
        if (!isResolved) {
          while (main.hasAvailableWorker() && pending.length > 0 && !isResolved) {
            render();
          }

          if (pending.length === 0 && active.size === 0 && !isResolved) {
            isResolved = true;

            generatorResults.urls = completed.size;
            generatorResults.duration = timer();

            log.info(
              `rendered: ${generatorResults.rendered} page${
                generatorResults.rendered === 1 ? '' : 's'
              }`
            );
            log.info(`duration: ${generatorResults.duration.toFixed(1)} ms`);
            if (generatorResults.rendered > 0) {
              log.info(
                `average: ${(generatorResults.duration / generatorResults.rendered).toFixed(
                  1
                )} ms per page`
              );
            }
            if (generatorResults.errors > 0) {
              log.info(`errors: ${generatorResults.errors}`);
            }

            resolve(generatorResults);
          }
        }
      };

      const render = async () => {
        let pathname: string | undefined = undefined;
        try {
          if (isResolved) {
            return;
          }

          pathname = pending.shift();
          if (!pathname) {
            return;
          }

          const filePath = sys.getFilePath(opts.ourDir, pathname);

          active.add(pathname);

          const result = await main.render({
            pathname,
            filePath,
          });

          for (const p of result.links) {
            if (!pending.includes(p) && !active.has(p) && !completed.has(p)) {
              pending.push(p);
            }
          }

          await sys.appendResult(result);

          if (result.error) {
            log.error(pathname, result.error);
            generatorResults.errors++;
          } else if (result.ok) {
            generatorResults.rendered++;
            log.debug(pathname);
          }

          active.delete(pathname);
          completed.add(pathname);

          setTimeout(renderNext);
        } catch (e) {
          isResolved = true;
          reject(e);
        }
      };

      setTimeout(renderNext);
    } catch (e) {
      reject(e);
    }
  });
}
