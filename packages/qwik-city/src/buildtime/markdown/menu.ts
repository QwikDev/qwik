import type { BuildContext, ParsedMenu, ParsedMenuItem } from '../types';
import { marked } from 'marked';
import { getMenuPathname, getMenuLinkHref } from '../utils/pathname';
import { createFileId, normalizePath } from '../utils/fs';
import fs from 'fs';

export async function createMenu(ctx: BuildContext, routesDir: string, filePath: string) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return createMenuFromMarkdown(ctx, routesDir, filePath, content);
}

export function createMenuFromMarkdown(
  ctx: BuildContext,
  routesDir: string,
  filePath: string,
  content: string
) {
  filePath = normalizePath(filePath);
  const id = createFileId(ctx, routesDir, filePath);

  const menu: ParsedMenu = {
    pathname: getMenuPathname(ctx.opts, filePath),
    filePath,
    text: '',
    items: [],
    id,
  };

  const tokens = marked.lexer(content, {});
  let hasH1 = false;
  let h2: ParsedMenuItem | null = null;

  for (const t of tokens) {
    if (t.type === 'heading') {
      if (t.depth === 1) {
        if (!hasH1) {
          menu.text = t.text;
          hasH1 = true;
        } else {
          throw new Error(`Only one h1 can be used in the menu: ${filePath}`);
        }
      } else if (t.depth === 2) {
        if (!hasH1) {
          throw new Error(`Menu must start with an h1 in the index: ${filePath}`);
        }
        for (const h2Token of t.tokens) {
          if (h2Token.type === 'text') {
            h2 = {
              text: h2Token.text,
            };
            menu.items = menu.items || [];
            menu.items!.push(h2);
          } else if (h2Token.type === 'link') {
            h2 = {
              text: h2Token.text,
              href: getMenuLinkHref(ctx.opts, filePath, h2Token.href),
            };
            menu.items!.push(h2);
          } else {
            `Headings can only be a text or link. Received "${h2Token.type}", value "${h2Token.raw}", in menu: ${filePath}`;
          }
        }
      } else {
        throw new Error(`Only h1 and h2 headings can be used in the menu: ${filePath}`);
      }
    } else if (t.type === 'list') {
      if (!h2) {
        throw new Error(`Lists must be after an h2 heading in the menu: ${filePath}`);
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
                    href: getMenuLinkHref(ctx.opts, filePath, liItem.href),
                  });
                } else {
                  throw new Error(
                    `List items can only be a text or link. Received "${liItem.type}", value "${liItem.raw}", in menu: ${filePath}`
                  );
                }
              }
            } else if (liToken.type === 'link') {
              h2.items.push({
                text: liToken.text,
                href: getMenuLinkHref(ctx.opts, filePath, liToken.href),
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

  return menu;
}

export function isMenuFileName(fileName: string) {
  return fileName === '_menu.md';
}
