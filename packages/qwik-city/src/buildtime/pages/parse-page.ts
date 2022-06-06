import type { BuildContext, ParsedPage } from '../types';
import { normalizePath } from '../utils/fs';
import { parsePageRoute } from '../utils/routing';

export function parseTypeScriptFile(ctx: BuildContext, filePath: string) {
  const page: ParsedPage = {
    head: {},
    layouts: [],
    route: parsePageRoute(filePath),
    attributes: {},
    path: normalizePath(filePath),
  };

  return page;
}
