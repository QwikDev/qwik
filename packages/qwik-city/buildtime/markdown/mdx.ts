import type { CompileOptions } from '@mdx-js/mdx/lib/compile';
import { createHash } from 'node:crypto';
import { SourceMapGenerator } from 'source-map';
import { getExtension } from '../../utils/fs';
import type { BuildContext } from '../types';
import { parseFrontmatter } from './frontmatter';
import { rehypePage, rehypeSlug, renameClassname, wrapTableWithDiv } from './rehype';
import { rehypeSyntaxHighlight } from './syntax-highlight';

export async function createMdxTransformer(ctx: BuildContext): Promise<MdxTransform> {
  const { createFormatAwareProcessors } = await import(
    '@mdx-js/mdx/lib/util/create-format-aware-processors.js'
  );
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

  const mdxOpts: CompileOptions = {
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

  const { extnames, process } = createFormatAwareProcessors(mdxOpts);

  return async function (code: string, id: string) {
    const ext = getExtension(id);
    if (extnames.includes(ext)) {
      const file = new VFile({ value: code, path: id });
      const compiled = await process(file);
      const output = String(compiled.value);
      const hasher = createHash('sha256');
      const key = hasher
        .update(output)
        .digest('base64')
        .slice(0, 8)
        .replace('+', '-')
        .replace('/', '_');
      const addImport = `import { _jsxC, RenderOnce } from '@builder.io/qwik';\n`;
      const newDefault = `
const WrappedMdxContent = () => {
  return _jsxC(RenderOnce, {children: _jsxC(MDXContent, {}, 3, null)}, 3, ${JSON.stringify(key)});
};
export default WrappedMdxContent;
`;

      return {
        code: addImport + output.replace('export default MDXContent;\n', newDefault),
        map: compiled.map,
      };
    }
  };
}

export type MdxTransform = (
  code: string,
  id: string
) => Promise<{ code: string; map: any } | undefined>;
