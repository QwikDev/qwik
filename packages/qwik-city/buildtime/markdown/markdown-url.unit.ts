import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { getMarkdownRelativeUrl } from './markdown-url';
import type { NormalizedPluginOptions } from '../types';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('getMarkdownRelativeUrl', () => {
  const routesDir = tmpdir();
  const menuFilePath = join(routesDir, 'docs', 'menu.md');

  const t = [
    {
      href: './getting-started/index.mdx',
      expect: '/docs/getting-started',
    },
    {
      href: './getting-started/index.mdx?intro',
      expect: '/docs/getting-started?intro',
    },
    {
      href: './getting-started/index.mdx#intro',
      expect: '/docs/getting-started#intro',
    },
    {
      href: './getting-started/index.mdx#intro',
      trailingSlash: true,
      expect: '/docs/getting-started/#intro',
    },
    {
      href: '/link',
      expect: '/link',
    },
    {
      href: '/link/index.mdx',
      expect: '/link',
    },
    {
      href: 'http://builder.io/',
      expect: 'http://builder.io/',
    },
    {
      href: '#hash',
      expect: '#hash',
    },
    {
      href: '',
      expect: '',
    },
    {
      href: './getting-started.txt',
      expect: './getting-started.txt',
    },
  ];

  t.forEach((c) => {
    const opts: NormalizedPluginOptions = {
      basePathname: '/',
      trailingSlash: !!c.trailingSlash,
      routesDir: routesDir,
      mdxPlugins: {
        remarkGfm: true,
        rehypeSyntaxHighlight: true,
        rehypeAutolinkHeadings: true,
      },
      mdx: {},
      baseUrl: '/',
    };
    equal(getMarkdownRelativeUrl(opts, menuFilePath, c.href), c.expect);
  });
});

test.run();
