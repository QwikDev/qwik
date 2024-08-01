import { assert, test } from 'vitest';
import type { NormalizedPluginOptions, RouteSourceFile } from '../types';
import { resolveLayout } from './resolve-source-file';
import { getSourceFile } from './source-file';

test('resolveLayout', () => {
  const t = [
    {
      fileName: 'layout.tsx',
      expect: {
        layoutName: '',
        layoutType: 'nested',
      },
    },
    {
      fileName: 'layout!.tsx',
      expect: {
        layoutName: '',
        layoutType: 'top',
      },
    },
    {
      fileName: 'layout-foo.tsx',
      expect: {
        layoutName: 'foo',
        layoutType: 'nested',
      },
    },
    {
      fileName: 'layout-foo!.tsx',
      expect: {
        layoutName: 'foo',
        layoutType: 'top',
      },
    },
  ];

  t.forEach((c) => {
    const opts: NormalizedPluginOptions = {
      routesDir: '',
      serverPluginsDir: '',
      basePathname: '/',
      trailingSlash: false,
      mdxPlugins: {
        remarkGfm: true,
        rehypeSyntaxHighlight: true,
        rehypeAutolinkHeadings: true,
      },
      mdx: {},
      platform: {},
      rewriteRoutes: [],
    };
    const sourceFile: RouteSourceFile = {
      ...getSourceFile(c.fileName)!,
      dirPath: '',
      dirName: '',
      filePath: '',
      fileName: '',
    };
    const l = resolveLayout(opts, sourceFile);
    assert.equal(l.layoutName, c.expect.layoutName, c.fileName);
    assert.equal(l.layoutType, c.expect.layoutType, c.fileName);
  });
});
