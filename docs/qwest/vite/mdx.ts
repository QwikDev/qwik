import { CompileOptions } from '@mdx-js/mdx/lib/compile';
import { extname } from 'path';
import { SourceMapGenerator } from 'source-map';
import type { MdxOptions } from './types';

export async function createMdxTransformer(
  userMdxOpts: MdxOptions | undefined
): Promise<MdxTransform> {
  const { createFormatAwareProcessors } = await import(
    '@mdx-js/mdx/lib/util/create-format-aware-processors.js'
  );
  const { default: remarkFrontmatter } = await import('remark-frontmatter');
  const { default: remarkGfm } = await import('remark-gfm');
  const { remarkMdxFrontmatter } = await import('remark-mdx-frontmatter');
  const { VFile } = await import('vfile');

  userMdxOpts = userMdxOpts || {};

  const userRemarkPlugins = userMdxOpts.remarkPlugins || [];
  const remarkPlugins = [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter];

  const mdxOpts: CompileOptions = {
    SourceMapGenerator,
    jsxImportSource: '@builder.io/qwik',
    ...userMdxOpts,
    remarkPlugins: [...userRemarkPlugins, ...remarkPlugins],
  };

  const { extnames, process } = createFormatAwareProcessors(mdxOpts);

  return async function (code: string, id: string) {
    const ext = extname(id);
    if (extnames.includes(ext)) {
      const file = new VFile({ value: code, path: id });
      const compiled = await process(file);
      return {
        code: String(compiled.value),
        map: compiled.map,
      };
    }
  };
}

export type MdxTransform = (
  code: string,
  id: string
) => Promise<{ code: string; map: any } | undefined>;
