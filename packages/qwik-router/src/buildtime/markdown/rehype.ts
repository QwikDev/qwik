import type { Transformer } from 'unified';
import Slugger from 'github-slugger';
import type { Root } from 'mdast';
import type { MdxjsEsm } from 'mdast-util-mdx';
import { valueToEstree } from 'estree-util-value-to-estree';
import { headingRank } from 'hast-util-heading-rank';
import { toString } from 'hast-util-to-string';
import { visit } from 'unist-util-visit';
import type { ContentHeading } from '../../runtime/src';
import type { RoutingContext, NormalizedPluginOptions } from '../types';
import { getExtension, isMarkdownExt, normalizePath } from '../../utils/fs';
import { frontmatterAttrsToDocumentHead } from './frontmatter';
import { isSameOriginUrl } from '../../utils/pathname';
import { getMarkdownRelativeUrl } from './markdown-url';

export function rehypeSlug(): Transformer {
  return (ast) => {
    const mdast = ast as Root;
    const slugs = new Slugger();

    visit(mdast, 'element', (node: any) => {
      const level = headingRank(node);
      if (level && node.properties) {
        const text = toString(node);

        if (!hasProperty(node, 'id')) {
          node.properties.id = slugs.slug(text);
        }
      }
    });
  };
}

export function rehypePage(ctx: RoutingContext): Transformer {
  return (ast, vfile) => {
    const mdast = ast as Root;
    const sourcePath = normalizePath(vfile.path);

    updateContentLinks(mdast, ctx.opts, sourcePath);
    exportFrontmatter(ctx, mdast, sourcePath);
    exportContentHead(ctx, mdast, sourcePath);
    exportContentHeadings(mdast);
  };
}

export function renameClassname(): Transformer {
  return (ast) => {
    const mdast = ast as Root;

    visit(mdast, 'element', (node: any) => {
      if (node.properties) {
        if (node.properties.className) {
          node.properties.class = node.properties.className;
          node.properties.className = undefined;
        }
      }
    });
  };
}

export function wrapTableWithDiv(): Transformer {
  return (ast) => {
    const mdast = ast as Root;

    visit(mdast, 'element', (node: any) => {
      if (node.tagName === 'table' && !node.done) {
        const table = { ...node };
        table.done = true;
        node.tagName = 'div';
        node.properties = { className: 'table-wrapper' };
        node.children = [table];
      }
    });
  };
}

function updateContentLinks(mdast: Root, opts: NormalizedPluginOptions, sourcePath: string) {
  visit(mdast, 'element', (node: any) => {
    const tagName = node && node.type === 'element' && node.tagName.toLowerCase();
    if (tagName === 'a') {
      const href = ((node.properties && node.properties.href) || '').trim();

      if (isSameOriginUrl(href)) {
        const ext = getExtension(href);

        if (isMarkdownExt(ext)) {
          node.properties.href = getMarkdownRelativeUrl(
            opts,
            sourcePath,
            node.properties.href,
            true
          );
        }
      }
    }
  });
}

function exportFrontmatter(ctx: RoutingContext, mdast: Root, sourcePath: string) {
  const attrs = ctx.frontmatter.get(sourcePath);
  createExport(mdast, 'frontmatter', attrs);
}

function exportContentHead(ctx: RoutingContext, mdast: Root, sourcePath: string) {
  const attrs = ctx.frontmatter.get(sourcePath);
  const head = frontmatterAttrsToDocumentHead(attrs);
  if (head) {
    createExport(mdast, 'head', head);
  }
}

function exportContentHeadings(mdast: Root) {
  const headings: ContentHeading[] = [];

  visit(mdast, 'element', (node: any) => {
    const level = headingRank(node);
    if (level && node.properties) {
      if (hasProperty(node, 'id')) {
        const text = toString(node);
        headings.push({
          text,
          id: node.properties.id,
          level,
        });
      }
    }
  });

  if (headings.length > 0) {
    createExport(mdast, 'headings', headings);
  }
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
            attributes: [],
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
