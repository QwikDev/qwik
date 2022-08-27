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

export function frontmatterAttrsToDocumentHead(attrs: FrontmatterAttrs | undefined) {
  if (attrs && Object.keys(attrs).length > 0) {
    const head: Required<ResolvedDocumentHead> = { title: '', meta: [], styles: [], links: [] };

    for (const attrName in attrs) {
      const attrValue = attrs[attrName];
      if (attrName === 'title' && attrValue) {
        head.title = attrValue.toString();
      } else if (attrName === 'description' && attrValue) {
        head.meta.push({
          name: attrName,
          content: attrValue.toString(),
        });
      }
    }
    return head;
  }
  return null;
}
