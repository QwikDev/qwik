import type { Transformer } from 'unified';
import type { BuildContext, FrontmatterAttrs } from '../types';
import { normalizePath } from '../../utils/fs';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import type { ResolvedDocumentHead } from '../../runtime/src';

export function parseFrontmatter(ctx: BuildContext): Transformer {
  return (mdast, vfile) => {
    const attrs: FrontmatterAttrs = {};

    visit(mdast, 'yaml', (node: any) => {
      const parsedAttrs = parseFrontmatterAttrs(node.value) as FrontmatterAttrs;
      for (const k in parsedAttrs) {
        attrs[k] = parsedAttrs[k];
      }
    });

    if (Object.keys(attrs).length > 0) {
      ctx.frontmatter.set(normalizePath(vfile.path), attrs);
    }
  };
}

export function parseFrontmatterAttrs(yaml: string) {
  if (typeof yaml === 'string') {
    yaml = yaml.trim();
    if (yaml !== '') {
      return parseYaml(yaml);
    }
  }
  return null;
}

// https://developer.mozilla.org/en-US/docs/Web/HTML/Element/meta/name
const metaNames: { [attrName: string]: boolean } = {
  author: true,
  creator: true,
  'color-scheme': true,
  description: true,
  generator: true,
  keywords: true,
  publisher: true,
  referrer: true,
  robots: true,
  'theme-color': true,
  viewport: true,
};

export function frontmatterAttrsToDocumentHead(attrs: FrontmatterAttrs | undefined) {
  if (attrs != null && typeof attrs === 'object') {
    const attrNames = Object.keys(attrs);
    if (attrNames.length > 0) {
      const head: Required<ResolvedDocumentHead> = {
        title: '',
        meta: [],
        styles: [],
        links: [],
        frontmatter: {},
      };

      for (const attrName of attrNames) {
        const attrValue = attrs[attrName];
        if (attrValue != null) {
          if (attrName === 'title') {
            head.title = attrValue.toString();
          } else if (metaNames[attrName]) {
            head.meta.push({
              name: attrName,
              content: attrValue.toString(),
            });
          } else {
            head.frontmatter[attrName] = attrValue;
          }
        }
      }
      return head;
    }
  }
  return null;
}
