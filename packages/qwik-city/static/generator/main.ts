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
  log.debug(`initMain(), entry urls: ${opts.urls.length}`);

  return new Promise<StaticGeneratorResults>((resolve, reject) => {
    try {
      const timer = sys.createTimer();
      const generatorResults: StaticGeneratorResults = {
        duration: 0,
        rendered: 0,
        errors: 0,
        urls: 0,
      };

      const pending = [...opts.urls];
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

            log.info(`rendered: ${generatorResults.rendered}`);
            log.info(
              `average: ${(generatorResults.duration / generatorResults.rendered).toFixed(1)} ms`
            );
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

          active.delete(pathname);
          completed.add(pathname);

          for (const p of result.links) {
            if (!pending.includes(p) && !active.has(p) && !completed.has(p)) {
              pending.push(p);
            }
          }

          await sys.appendResult(result);

          if (result.error) {
            generatorResults.errors++;
          } else {
            generatorResults.rendered++;
          }

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
