import type { CompileOptions } from '@mdx-js/mdx';
import { SourceMapGenerator } from 'source-map';
import { getExtension } from '../../utils/fs';
import type { RoutingContext } from '../types';
import { parseFrontmatter } from './frontmatter';
import { rehypePage, rehypeSlug, renameClassname, wrapTableWithDiv } from './rehype';
import { rehypeSyntaxHighlight } from './syntax-highlight';

export async function createMdxTransformer(ctx: RoutingContext): Promise<MdxTransform> {
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
    jsxImportSource: '@qwik.dev/core',
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
      const addImport = `import { jsx } from '@qwik.dev/core';\n`;
      // the _missingMdxReference call is automatically added by mdxjs
      const newDefault = `
function _missingMdxReference(id, component, place) {
  throw new Error("${id}: Expected " + (component ? "component" : "object") + " \`" + id + "\` to be defined: you likely forgot to import, pass, or provide it." + (place ? "\\nIt’s referenced in your code at \`" + place + "\`" : ""));
}
const WrappedMdxContent = () => {
  const content = _createMdxContent({});
  return typeof MDXLayout === 'function' ? jsx(MDXLayout, {children: content}) : content;
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
