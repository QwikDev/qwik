import { getErrorHtml } from '../middleware/request-handler/error-handler';
import type { RouteData } from '../runtime/src/types';
import type { StaticGenerateOptions, System } from './types';

export async function generateNotFoundPages(
  sys: System,
  opts: StaticGenerateOptions,
  routes: RouteData[]
) {
  if (opts.emit404Pages !== false) {
    const basePathname = opts.basePathname || '/';
    const rootNotFoundPathname = basePathname + '404.html';

    const hasRootNotFound = routes.some((r) => r[3] === rootNotFoundPathname);
    if (!hasRootNotFound) {
      const filePath = sys.getPageFilePath(rootNotFoundPathname);

      const html = getErrorHtml(404, 'Resource Not Found');

      await sys.ensureDir(filePath);

      return new Promise<void>((resolve) => {
        const writer = sys.createWriteStream(filePath);
        writer.write(html);
        writer.close(resolve);
      });
    }
  }
}
