import type { Transformer } from 'unified';
import Slugger from 'github-slugger';
import type { Root } from 'mdast';
import type { MdxjsEsm } from 'mdast-util-mdx';
import { valueToEstree } from 'estree-util-value-to-estree';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { PageBreadcrumb, PageHeading, PageSource } from '../runtime';
import { dirname, relative, resolve } from 'path';
import type { PluginContext } from './types';
import { getPagePathname } from './utils';
import { existsSync } from 'fs';

const slugs = new Slugger();

export function rehypePage(ctx: PluginContext): Transformer {
  return (ast, vfile) => {
    const mdast = ast as Root;
    const sourcePath = vfile.path;
    const pathname = getPagePathname(ctx, vfile.path);
    const indexPathname = getPageIndexPathname(ctx, pathname);

    updateContentLinks(ctx, mdast, sourcePath);
    exportContentHeadings(mdast);
    exportPageAttributes(ctx, mdast, pathname);
    exportBreadcrumbs(ctx, mdast, pathname, indexPathname);
    exportPageIndex(ctx, mdast, indexPathname);
    exportPageSource(ctx, mdast, sourcePath);
  };
}

function updateContentLinks(ctx: PluginContext, mdast: Root, sourcePath: string) {
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

function exportContentHeadings(mdast: Root) {
  slugs.reset();
  const headings: PageHeading[] = [];

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

  createExport(mdast, 'headings', headings);
}

function exportPageAttributes(ctx: PluginContext, mdast: Root, pathname: string) {
  const page = ctx.pages.find((p) => p.pathname === pathname);
  const attributes = page?.attrs || {};
  createExport(mdast, 'attributes', attributes);
}

function exportBreadcrumbs(
  ctx: PluginContext,
  mdast: Root,
  pathname: string,
  indexPathname: string | undefined
) {
  const index = ctx.indexes.find((i) => i.pathname === indexPathname);
  if (index && index.items) {
    for (const indexA of index.items) {
      const breadcrumbA: PageBreadcrumb = {
        text: indexA.text,
        href: indexA.href,
      };
      if (indexA.href === pathname) {
        createExport(mdast, 'breadcrumbs', [breadcrumbA]);
        return;
      }
      if (indexA.items) {
        for (const indexB of indexA.items) {
          const breadcrumbB: PageBreadcrumb = {
            text: indexB.text,
            href: indexB.href,
          };
          if (indexB.href === pathname) {
            createExport(mdast, 'breadcrumbs', [breadcrumbA, breadcrumbB]);
            return;
          }
          if (indexB.items) {
            for (const indexC of indexB.items) {
              const breadcrumbC: PageBreadcrumb = {
                text: indexC.text,
                href: indexC.href,
              };
              if (indexC.href === pathname) {
                createExport(mdast, 'breadcrumbs', [breadcrumbA, breadcrumbB, breadcrumbC]);
                return;
              }
            }
          }
        }
      }
    }
  }

  createExport(mdast, 'breadcrumbs', []);
}

function exportPageIndex(ctx: PluginContext, mdast: Root, indexPathname: string | undefined) {
  createExport(mdast, 'index', {
    path: indexPathname,
  });
}

function exportPageSource(ctx: PluginContext, mdast: Root, sourcePath: string) {
  const source: PageSource = {
    path: relative(ctx.opts.pagesDir, sourcePath),
  };
  createExport(mdast, 'source', source);
}

function getPageIndexPathname(ctx: PluginContext, pathname: string) {
  for (let i = 0; i < 9; i++) {
    const index = ctx.indexes.find((i) => i.pathname === pathname);
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
