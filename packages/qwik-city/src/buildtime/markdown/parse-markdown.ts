import type { ParsedPage, NormalizedPluginOptions } from '../types';
import frontmatter from 'front-matter';
import { getPageTitle } from '../utils/format';
import { parsePageRoute } from '../utils/routing';
import { normalizePath } from '../utils/fs';

export function parseMarkdownFile(
  opts: NormalizedPluginOptions,
  filePath: string,
  content: string
) {
  const parsed = frontmatter<any>(content);
  const attributes: { [prop: string]: string } = parsed.attributes || {};

  const page: ParsedPage = {
    head: {
      title: getPageTitle(filePath, attributes),
    },
    layouts: [],
    route: parsePageRoute(filePath),
    attributes,
    path: normalizePath(filePath),
  };

  delete page.attributes.title;

  return page;
}
