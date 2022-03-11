import type { Options as MdxRollupOptions } from '@mdx-js/rollup';

export async function buildMdxPlugin(userMdxOpts: MdxRollupOptions) {
  const { default: mdx } = await import('@mdx-js/rollup');
  const { default: remarkFrontmatter } = await import('remark-frontmatter');
  const { default: remarkGfm } = await import('remark-gfm');
  const { remarkMdxFrontmatter } = await import('remark-mdx-frontmatter');

  userMdxOpts = userMdxOpts || {};

  const remarkPlugins = [remarkGfm, remarkFrontmatter, remarkMdxFrontmatter];

  const mdxOpts = {
    jsxImportSource: '@builder.io/qwik',
    ...userMdxOpts,
    remarkPlugins: [...(userMdxOpts.remarkPlugins || []), ...remarkPlugins],
  };

  return mdx(mdxOpts);
}
