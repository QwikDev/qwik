import type { BuildContext, PageRoute } from '../types';
import frontmatter from 'front-matter';
import { getPageTitle } from '../utils/format';
import { createFileId } from '../utils/fs';
import { getRoutePathname } from '../utils/pathname';
import { parseRouteId } from '../routing/parse-route';

export function parseMarkdownFile(
  ctx: BuildContext,
  routesDir: string,
  filePath: string,
  content: string
) {
  const id = createFileId(ctx, routesDir, filePath);
  const parsed = frontmatter<any>(content);
  const attributes: { [prop: string]: string } = parsed.attributes || {};
  const title = getPageTitle(filePath, attributes);

  delete attributes.title;

  const pathname = getRoutePathname(ctx.opts, filePath);

  const route = parseRouteId(pathname);

  const pageRoute: PageRoute = {
    type: 'page',
    id,
    pathname,
    filePath,
    layouts: [],
    default: undefined,
    attributes,
    head: {
      title,
      links: [],
      meta: [],
      styles: [],
    },
    ...route,
  };

  return pageRoute;
}
