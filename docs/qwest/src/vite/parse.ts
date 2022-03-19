import type { PluginContext, ParsedIndex, ParsedIndexData, ParsedPage } from './types';
import frontmatter from 'front-matter';
import { marked } from 'marked';
import {
  getIndexPathname,
  getIndexLinkHref,
  getPagePathname,
  validateLayout,
  getPageTitle,
} from './utils';

export function parseMarkdownFile(ctx: PluginContext, filePath: string, content: string) {
  const parsed = frontmatter<any>(content);
  const attrs: { [prop: string]: string } = parsed.attributes || {};

  validateLayout(ctx, filePath, attrs);

  attrs.title = getPageTitle(filePath, attrs);

  const page: ParsedPage = {
    pathname: getPagePathname(ctx, filePath),
    attrs,
    filePath,
  };
  return page;
}

export function parseIndexFile(ctx: PluginContext, indexFilePath: string, content: string) {
  const index: ParsedIndexData = {
    pathname: getIndexPathname(ctx, indexFilePath),
    filePath: indexFilePath,
    text: '',
    items: [],
  };

  const tokens = marked.lexer(content, {});
  let hasH1 = false;
  let h2: ParsedIndex | null = null;

  for (const t of tokens) {
    if (t.type === 'heading') {
      if (t.depth === 1) {
        if (!hasH1) {
          index.text = t.text;
          hasH1 = true;
        } else {
          throw new Error(`Only one h1 can be used in the index: ${indexFilePath}`);
        }
      } else if (t.depth === 2) {
        if (!hasH1) {
          throw new Error(`Readme must start with an h1 in the index: ${indexFilePath}`);
        }
        for (const h2Token of t.tokens) {
          if (h2Token.type === 'text') {
            h2 = {
              text: h2Token.text,
            };
            index.items = index.items || [];
            index.items!.push(h2);
          } else if (h2Token.type === 'link') {
            h2 = {
              text: h2Token.text,
              href: getIndexLinkHref(ctx, indexFilePath, h2Token.href),
            };
            index.items!.push(h2);
          } else {
            `Headings can only be a text or link. Received "${h2Token.type}", value "${h2Token.raw}", in index: ${indexFilePath}`;
          }
        }
      } else {
        throw new Error(`Only h1 and h2 headings can be used in the index: ${indexFilePath}`);
      }
    } else if (t.type === 'list') {
      if (!h2) {
        throw new Error(`Lists must be after an h2 heading in the index: ${indexFilePath}`);
      }
      h2.items = h2.items || [];
      for (const li of t.items) {
        if (li.type === 'list_item') {
          for (const liToken of li.tokens) {
            if (liToken.type === 'text') {
              for (const liItem of (liToken as any).tokens) {
                if (liItem.type === 'text') {
                  h2.items.push({ text: liItem.text });
                } else if (liItem.type === 'link') {
                  h2.items.push({
                    text: liItem.text,
                    href: getIndexLinkHref(ctx, indexFilePath, liItem.href),
                  });
                } else {
                  throw new Error(
                    `List items can only be a text or link. Received "${liItem.type}", value "${liItem.raw}", in index: ${indexFilePath}`
                  );
                }
              }
            } else if (liToken.type === 'link') {
              h2.items.push({
                text: liToken.text,
                href: getIndexLinkHref(ctx, indexFilePath, liToken.href),
              });
            } else {
              throw new Error(
                `List items can only be a text or link. Received "${liToken.type}", value "${liToken.raw}", in index: ${indexFilePath}`
              );
            }
          }
        } else {
          throw new Error(
            `Only list items can be used in lists. Received "${li.type}", value "${li.raw}", in index: ${indexFilePath}`
          );
        }
      }
    } else if (t.type === 'space') {
      continue;
    } else {
      throw new Error(
        `README.md index has a "${t.type}" with the value "${t.raw}". However, only headings and lists can be used in the index: ${indexFilePath}`
      );
    }
  }

  return index;
}
