import { SourceMapGenerator } from 'source-map';
import { rehypePage, rehypeSlug, renameClassname, wrapTableWithDiv } from './rehype';
import { rehypeSyntaxHighlight } from './syntax-highlight';
import type { BuildContext } from '../types';
import { parseFrontmatter } from './frontmatter';
import { getExtension } from '../../utils/fs';
import type { CompileOptions } from '@mdx-js/mdx';
import { createHash } from 'node:crypto';

export async function createMdxTransformer(ctx: BuildContext): Promise<MdxTransform> {
  const { compile } = await import('@mdx-js/mdx');
  const { default: remarkFrontmatter } = await import('remark-frontmatter');
  const { default: remarkGfm } = await import('remark-gfm');
  const { default: rehypeAutolinkHeadings } = await import('rehype-autolink-headings');

  const { VFile } = await import('vfile');

  const userMdxOpts = ctx.opts.mdx;

  const userRemarkPlugins = userMdxOpts.remarkPlugins || [];
  const userRehypePlugins = userMdxOpts.rehypePlugins || [];

  const coreMdxPlugins = ctx.opts.mdxPlugins;

  const coreRemarkPlugins = [];

  if (typeof coreMdxPlugins?.remarkGfm === 'undefined' || coreMdxPlugins.remarkGfm) {
    coreRemarkPlugins.push(remarkGfm);
  }

  const coreRehypePlugins = [];

  if (
    typeof coreMdxPlugins?.rehypeSyntaxHighlight === 'undefined' ||
    coreMdxPlugins.rehypeSyntaxHighlight
  ) {
    coreRehypePlugins.push(rehypeSyntaxHighlight);
  }

  if (
    typeof coreMdxPlugins?.rehypeAutolinkHeadings === 'undefined' ||
    coreMdxPlugins.rehypeAutolinkHeadings
  ) {
    coreRehypePlugins.push(rehypeAutolinkHeadings);
  }

  const options: CompileOptions = {
    SourceMapGenerator,
    jsxImportSource: '@builder.io/qwik',
    ...userMdxOpts,
    elementAttributeNameCase: 'html',
    remarkPlugins: [
      ...userRemarkPlugins,
      ...coreRemarkPlugins,
      remarkFrontmatter,
      [parseFrontmatter, ctx],
    ],
    rehypePlugins: [
      rehypeSlug,
      ...userRehypePlugins,
      ...coreRehypePlugins,
      [rehypePage, ctx],
      renameClassname,
      wrapTableWithDiv,
    ],
  };
  return async function (code: string, id: string) {
    const ext = getExtension(id);
    if (['.mdx', '.md', '.markdown'].includes(ext)) {
      const file = new VFile({ value: code, path: id });
      const compiled = await compile(file, options);
      const output = String(compiled.value);
      const hasher = createHash('sha256');
      const key = hasher
        .update(output)
        .digest('base64')
        .slice(0, 8)
        .replace('+', '-')
        .replace('/', '_');
      const addImport = `import { jsx, _jsxC, RenderOnce } from '@builder.io/qwik';\n`;
      // the _missingMdxReference call is automatically added by mdxjs
      const newDefault = `
function _missingMdxReference(id, component, place) {
  throw new Error("${id}: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
}
const WrappedMdxContent = (props = {}) => {
  const content = _jsxC(RenderOnce, {children: _jsxC(_createMdxContent, props, 3, null)}, 3, ${JSON.stringify(key)});
  if (typeof MDXLayout === 'function'){
      return jsx(MDXLayout, {children: content});
  }
  return content;
};
export default WrappedMdxContent;
`;
      const exportIndex = output.lastIndexOf('export default ');
      if (exportIndex === -1) {
        throw new Error('Could not find default export in mdx output');
      }
      const wrappedOutput = addImport + output.slice(0, exportIndex) + newDefault;
      return {
        code: wrappedOutput,
        map: compiled.map,
      };
    }
  };
}

export type MdxTransform = (
  code: string,
  id: string
) => Promise<{ code: string; map: any } | undefined>;
