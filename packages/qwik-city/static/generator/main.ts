import type { Logger, MainContext, NormalizedStaticGeneratorOptions, System } from './types';

export async function main(
  opts: NormalizedStaticGeneratorOptions,
  log: Logger,
  main: MainContext,
  sys: System
) {
  log.debug(`initMain(), entry urls: ${opts.urls.length}`);

  return new Promise<void>((resolve, reject) => {
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
          log.info(`rendered: ${completed.size}`);
          resolve();
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

        const filePath = sys.getFilePath(opts.ourDir, pathname);

        active.add(pathname);

        log.debug(`  ${pathname}`);

        const rsp = await main.render({
          pathname,
          filePath,
        });

        active.delete(pathname);
        completed.add(pathname);

        for (const p of rsp.anchorPathnames) {
          if (!pending.includes(p) && !active.has(p) && !completed.has(p)) {
            pending.push(p);
          }
        }

        setTimeout(renderNext);
      } catch (e) {
        isResolved = true;
        log.error(e);
        reject(e);
      }
    };

    setTimeout(renderNext);
  });
}
