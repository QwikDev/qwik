import type { Transformer } from 'unified';
import type { BuildContext, FrontmatterAttrs } from '../types';
import { normalizePath } from '../utils/fs';
import { visit } from 'unist-util-visit';
import type { ResolvedDocumentHead } from '../../runtime/src';

export function parseFrontmatter(ctx: BuildContext): Transformer {
  return (mdast, vfile) => {
    const attrs: FrontmatterAttrs = {};

    visit(mdast, 'yaml', (node: any) => {
      parseFrontmatterAttrs(attrs, node.value);
    });

    if (Object.keys(attrs).length > 0) {
      ctx.frontmatter.set(normalizePath(vfile.path), attrs);
    }
  };
}

export function parseFrontmatterAttrs(attrs: FrontmatterAttrs, yaml: string) {
  if (typeof yaml === 'string') {
    yaml = yaml.trim();
    if (yaml !== '') {
      const lines = yaml.split(/\r?\n|\r|\n/g);
      for (const line of lines) {
        const parts = line.split(':');
        if (parts.length > 1) {
          const attrName = parts[0].trim();
          const attrValue = parts.slice(1).join(':').trim();
          attrs[attrName] = attrValue;
        }
      }
    }
  }
  return null;
}

export function frontmatterAttrsToDocumentHead(attrs: FrontmatterAttrs | undefined) {
  if (attrs && Object.keys(attrs).length > 0) {
    const head: Required<ResolvedDocumentHead> = { title: '', meta: [], styles: [], links: [] };

    for (const attrName in attrs) {
      const attrValue = attrs[attrName];
      if (attrName === 'title') {
        head.title = attrValue;
      } else if (attrName === 'description') {
        head.meta.push({
          name: attrName,
          content: attrValue,
        });
      }
    }
    return head;
  }
  return null;
}
