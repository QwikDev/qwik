import type { Transformer } from 'unified';
import type { BuildContext } from '../types';
import { normalizePath } from '../utils/fs';
import { visit } from 'unist-util-visit';

export function parseFrontmatter(ctx: BuildContext): Transformer {
  return (mdast, vfile) => {
    const filePath = normalizePath(vfile.path);
    const attrs: string[] = [];

    visit(mdast, 'yaml', (node: any) => {
      if (typeof node.value === 'string' && node.value.length > 0) {
        attrs.push(node.value);
      }
    });

    if (attrs.length > 0) {
      ctx.frontmatter.set(filePath, attrs);
    }
  };
}
