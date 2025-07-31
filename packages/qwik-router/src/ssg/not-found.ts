import type { RouteData } from '@qwik.dev/router';
import { getErrorHtml } from '@qwik.dev/router/middleware/request-handler';
import type { SsgOptions, System } from './types';
import { RouteDataProp } from '../runtime/src/types';

export async function generateNotFoundPages(sys: System, opts: SsgOptions, routes: RouteData[]) {
  if (opts.emit404Pages !== false) {
    const basePathname = opts.basePathname || '/';
    const rootNotFoundPathname = basePathname + '404.html';

    const hasRootNotFound = routes.some(
      (r) => r[RouteDataProp.OriginalPathname] === rootNotFoundPathname
    );
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
