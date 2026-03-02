import type { NormalizedPluginOptions, BuiltMenu, ParsedMenuItem, RouteSourceFile } from '../types';
import { marked } from 'marked';
import { createFileId, getMenuPathname } from '../../utils/fs';
import { getMarkdownRelativeUrl } from './markdown-url';

export function createMenu(opts: NormalizedPluginOptions, filePath: string) {
  const menu: BuiltMenu = {
    pathname: getMenuPathname(opts, filePath),
    filePath,
  };
  return menu;
}

export function resolveMenu(opts: NormalizedPluginOptions, menuSourceFile: RouteSourceFile) {
  return createMenu(opts, menuSourceFile.filePath);
}

export async function transformMenu(
  opts: NormalizedPluginOptions,
  filePath: string,
  content: string
) {
  const parsedMenu = parseMenu(opts, filePath, content);
  const id = createFileId(opts.routesDir, filePath);
  const code = `const ${id} = ${JSON.stringify(parsedMenu, null, 2)};`;
  return `${code} export default ${id}`;
}

export function parseMenu(
  opts: NormalizedPluginOptions,
  filePath: string,
  content: string,
  checkFileExists = true
) {
  const tokens = marked.lexer(content, {});
  let currentDepth = 0;
  const stack: ParsedMenuItem[] = [];
  for (const t of tokens) {
    if (t.type === 'heading') {
      const diff = currentDepth - t.depth;
      if (diff >= 0) {
        stack.length -= diff + 1;
      }
      if (diff < -1) {
        throw new Error(
          `Menu hierarchy skipped a level, went from <h${'#'.repeat(
            currentDepth
          )}> to <h${'#'.repeat(t.depth)}>, in menu: ${filePath}`
        );
      }
      currentDepth = t.depth;
      const parentNode = stack[stack.length - 1];
      for (const h2Token of t.tokens || []) {
        const lastNode: ParsedMenuItem = {
          text: '',
        };
        if (h2Token.type === 'text') {
          lastNode.text = h2Token.text;
        } else if (h2Token.type === 'link') {
          lastNode.text = h2Token.text;
          lastNode.href = getMarkdownRelativeUrl(opts, filePath, h2Token.href, checkFileExists);
        } else {
          throw new Error(
            `Headings can only be a text or link. Received "${h2Token.type}", value "${h2Token.raw}", in menu: ${filePath}`
          );
        }
        if (parentNode) {
          parentNode.items = parentNode.items || [];
          parentNode.items.push(lastNode);
        }
        stack.push(lastNode);
      }
    } else if (t.type === 'list') {
      const parentNode = stack[stack.length - 1];

      parentNode.items = parentNode.items || [];
      for (const li of t.items) {
        if (li.type === 'list_item') {
          for (const liToken of li.tokens) {
            if (liToken.type === 'text') {
              for (const liItem of (liToken as any).tokens) {
                if (liItem.type === 'text') {
                  parentNode.items.push({ text: liItem.text });
                } else if (liItem.type === 'link') {
                  parentNode.items.push({
                    text: liItem.text,
                    href: getMarkdownRelativeUrl(opts, filePath, liItem.href, checkFileExists),
                  });
                } else {
                  throw new Error(
                    `List items can only be a text or link. Received "${liItem.type}", value "${liItem.raw}", in menu: ${filePath}`
                  );
                }
              }
            } else if (liToken.type === 'link') {
              parentNode.items.push({
                text: liToken.text,
                href: getMarkdownRelativeUrl(opts, filePath, liToken.href, checkFileExists),
              });
            } else {
              throw new Error(
                `List items can only be a text or link. Received "${liToken.type}", value "${liToken.raw}", in menu: ${filePath}`
              );
            }
          }
        } else {
          throw new Error(
            `Only list items can be used in lists. Received "${li.type}", value "${li.raw}", in menu: ${filePath}`
          );
        }
      }
    } else if (t.type === 'space') {
      continue;
    } else {
      throw new Error(
        `Menu has a "${t.type}" with the value "${t.raw}". However, only headings and lists can be used in the menu: ${filePath}`
      );
    }
  }

  if (stack.length === 0) {
    throw new Error(`Menu must start with an h1 in the index: ${filePath}`);
  }
  return stack[0];
}
