import { getErrorHtml } from '@builder.io/qwik-city/middleware/request-handler';
import type { RouteData } from '@builder.io/qwik-city';
import type { StaticGenerateOptions, System } from './types';

export async function generateNotFoundPages(
  sys: System,
  opts: StaticGenerateOptions,
  routes: RouteData[]
) {
  if (opts.emit404Pages !== false) {
    const basePathname = opts.basePathname || '/';
    const rootNotFoundPathname = basePathname + '404.html';

    const hasRootNotFound = routes.some((r) => r[2] === rootNotFoundPathname);
    if (!hasRootNotFound) {
      const filePath = sys.getRouteFilePath(rootNotFoundPathname, true);

      const html = getErrorHtml(404, 'Resource Not Found');

      await sys.ensureDir(filePath);

      return new Promise<void>((resolve) => {
        const writer = sys.createWriteStream(filePath);
        writer.write(html);
        writer.end(resolve);
      });
    }
  }
}
