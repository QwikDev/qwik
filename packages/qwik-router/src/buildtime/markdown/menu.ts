import type { NormalizedPluginOptions, BuiltMenu, ParsedMenuItem, RouteSourceFile } from '../types';
import type { List, PhrasingContent, RootContent } from 'mdast';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
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
  const tree = unified().use(remarkParse).parse(content);
  let currentDepth = 0;
  const stack: ParsedMenuItem[] = [];
  for (const node of tree.children) {
    if (node.type === 'heading') {
      const diff = currentDepth - node.depth;
      if (diff >= 0) {
        stack.length -= diff + 1;
      }
      if (diff < -1) {
        throw new Error(
          `Menu hierarchy skipped a level, went from <h${'#'.repeat(
            currentDepth
          )}> to <h${'#'.repeat(node.depth)}>, in menu: ${filePath}`
        );
      }
      currentDepth = node.depth;
      const parentNode = stack[stack.length - 1];
      for (const inline of node.children) {
        const lastNode: ParsedMenuItem = {
          text: '',
        };
        if (inline.type === 'text') {
          lastNode.text = inline.value;
        } else if (inline.type === 'link') {
          lastNode.text = inlineText(inline.children);
          lastNode.href = getMarkdownRelativeUrl(opts, filePath, inline.url, checkFileExists);
        } else {
          throw new Error(
            `Headings can only be a text or link. Received "${inline.type}", value "${rawSource(
              content,
              inline
            )}", in menu: ${filePath}`
          );
        }
        if (parentNode) {
          parentNode.items = parentNode.items || [];
          parentNode.items.push(lastNode);
        }
        stack.push(lastNode);
      }
    } else if (node.type === 'list') {
      const parentNode = stack[stack.length - 1];
      if (!parentNode) {
        throw new Error(`Menu must start with an h1 in the index: ${filePath}`);
      }
      parentNode.items = parentNode.items || [];
      parseListItems(opts, filePath, content, node, parentNode, checkFileExists);
    } else {
      throw new Error(
        `Menu has a "${node.type}" with the value "${rawSource(
          content,
          node
        )}". However, only headings and lists can be used in the menu: ${filePath}`
      );
    }
  }

  if (stack.length === 0) {
    throw new Error(`Menu must start with an h1 in the index: ${filePath}`);
  }
  return stack[0];
}

function parseListItems(
  opts: NormalizedPluginOptions,
  filePath: string,
  content: string,
  list: List,
  parentNode: ParsedMenuItem,
  checkFileExists: boolean
) {
  for (const listItem of list.children) {
    for (const block of listItem.children) {
      if (block.type !== 'paragraph') {
        throw new Error(
          `List items can only be a text or link. Received "${block.type}", value "${rawSource(
            content,
            block
          )}", in menu: ${filePath}`
        );
      }
      for (const inline of block.children) {
        if (inline.type === 'text') {
          parentNode.items!.push({ text: inline.value });
        } else if (inline.type === 'link') {
          parentNode.items!.push({
            text: inlineText(inline.children),
            href: getMarkdownRelativeUrl(opts, filePath, inline.url, checkFileExists),
          });
        } else {
          throw new Error(
            `List items can only be a text or link. Received "${inline.type}", value "${rawSource(
              content,
              inline
            )}", in menu: ${filePath}`
          );
        }
      }
    }
  }
}

function inlineText(children: PhrasingContent[]): string {
  return children.map((child) => ('value' in child ? child.value : '')).join('');
}

function rawSource(content: string, node: RootContent | PhrasingContent) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start != null && end != null ? content.slice(start, end) : node.type;
}
