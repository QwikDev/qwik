import type { Transformer } from 'unified';
import Slugger from 'github-slugger';
import type { Root } from 'mdast';
import type { MdxjsEsm } from 'mdast-util-mdx';
import { valueToEstree } from 'estree-util-value-to-estree';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { ContentHeading, DocumentHead, DocumentMeta } from '../../runtime/src';
import { dirname, resolve } from 'path';
import type { BuildContext } from '../types';
import { getPathnameFromFilePath } from '../utils/pathname';
import { existsSync } from 'fs';
import { normalizePath } from '../utils/fs';
import { createBreadcrumbs } from './breadcrumbs';

export function rehypePage(ctx: BuildContext): Transformer {
  return (ast, vfile) => {
    const mdast = ast as Root;
    const sourcePath = normalizePath(vfile.path);

    updateContentLinks(mdast, sourcePath);
    exportContentHead(ctx, mdast, sourcePath);
    exportContentHeadings(mdast);
    exportBreadcrumbs(ctx, mdast, sourcePath);
  };
}

function updateContentLinks(mdast: Root, sourcePath: string) {
  visit(mdast, 'element', (node: any) => {
    const tagName = node && node.type === 'element' && node.tagName.toLowerCase();
    if (tagName !== 'a') {
      return;
    }

    const href = ((node.properties && node.properties.href) || '').trim();
    if (!isLocalHref(href)) {
      return;
    }

    const lowerHref = href.toLowerCase();
    if (lowerHref.endsWith('.mdx') || lowerHref.endsWith('.md')) {
      const mdxPath = resolve(dirname(sourcePath), href);
      const mdxExists = existsSync(mdxPath);
      if (!mdxExists) {
        console.warn(
          `\nThe link "${href}", found within "${sourcePath}", does not have a matching source file.\n`
        );
        return;
      }

      if (lowerHref.endsWith('.mdx')) {
        node.properties.href = node.properties.href.substring(0, href.length - 4);
      } else if (lowerHref.endsWith('.md')) {
        node.properties.href = node.properties.href.substring(0, href.length - 3);
      }
    }
  });
}

function exportContentHead(ctx: BuildContext, mdast: Root, sourcePath: string) {
  const attrs = ctx.frontmatter.get(sourcePath);
  if (Array.isArray(attrs) && attrs.length > 0) {
    const head: DocumentHead = { title: '', meta: [], styles: [], links: [] };

    for (const attr of attrs) {
      const parts = attr.split(':');
      if (parts.length > 1) {
        const attrName = parts.shift()!;
        const attrValue = parts.join(':');

        if (attrName === 'title') {
          head.title = attrValue;
        } else {
          const meta: DocumentMeta = {
            [attrName.startsWith('og:') ? 'property' : 'name']: attrName,
            content: attrValue,
          };
          head.meta.push(meta);
        }
      }
    }

    createExport(mdast, 'head', head);
  }
}

function exportContentHeadings(mdast: Root) {
  const slugs = new Slugger();
  const headings: ContentHeading[] = [];

  visit(mdast, 'element', (node: any) => {
    const level = headingRank(node);
    if (level && node.properties && !hasProperty(node, 'id')) {
      const text = toString(node);
      const id = slugs.slug(text);
      node.properties.id = id;

      headings.push({
        text,
        id,
        level,
      });
    }
  });

  if (headings.length > 0) {
    createExport(mdast, 'headings', headings);
  }
}

function exportBreadcrumbs(ctx: BuildContext, mdast: Root, sourcePath: string) {
  const pathname = getPathnameFromFilePath(ctx.opts, sourcePath);
  const menuPathname = getMenuPathname(ctx, pathname);
  if (menuPathname) {
    const breadcrumbs = createBreadcrumbs(ctx, pathname, menuPathname);
    if (breadcrumbs.length > 0) {
      createExport(mdast, 'breadcrumbs', breadcrumbs);
    }
  }
}

function getMenuPathname(ctx: BuildContext, pathname: string) {
  for (let i = 0; i < 9; i++) {
    const index = ctx.menus.find((i) => i.pathname === pathname);
    if (index) {
      return pathname;
    }

    const parts = pathname.split('/');
    parts.pop();

    pathname = parts.join('/');
    if (pathname === '/') {
      break;
    }
  }

  return undefined;
}

function createExport(mdast: Root, identifierName: string, val: any) {
  const mdxjsEsm: MdxjsEsm = {
    type: 'mdxjsEsm',
    value: '',
    data: {
      estree: {
        type: 'Program',
        sourceType: 'module',
        body: [
          {
            type: 'ExportNamedDeclaration',
            source: null,
            specifiers: [],
            declaration: {
              type: 'VariableDeclaration',
              kind: 'const',
              declarations: [
                {
                  type: 'VariableDeclarator',
                  id: { type: 'Identifier', name: identifierName },
                  init: valueToEstree(val),
                },
              ],
            },
          },
        ],
      },
    },
  };
  mdast.children.unshift(mdxjsEsm);
}

function isLocalHref(href: string) {
  href = href.toLowerCase();
  return !(
    href === '' ||
    href.startsWith('#') ||
    href.startsWith('https://') ||
    href.startsWith('http://') ||
    href.startsWith('about:')
  );
}

const own = {}.hasOwnProperty;
function hasProperty(node: any, propName: string) {
  const value =
    propName &&
    node &&
    typeof node === 'object' &&
    node.type === 'element' &&
    node.properties &&
    own.call(node.properties, propName) &&
    node.properties[propName];
  return value != null && value !== false;
}
