import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { getMarkdownRelativeUrl } from './markdown-url';
import type { NormalizedPluginOptions } from '../types';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const routesDir = tmpdir();
const serverPluginsDir = tmpdir();

const menuFilePath = join(routesDir, 'docs', 'menu.md');
[
  {
    href: './getting-started/index.mdx',
    trailingSlash: false,
    expect: '/docs/getting-started',
  },
  {
    href: './getting-started/index.mdx?intro',
    trailingSlash: false,
    expect: '/docs/getting-started?intro',
  },
  {
    href: './getting-started/index.mdx#intro',
    trailingSlash: false,
    expect: '/docs/getting-started#intro',
  },
  {
    href: './getting-started/index.mdx#intro',
    trailingSlash: true,
    expect: '/docs/getting-started/#intro',
  },
  {
    href: '/link',
    trailingSlash: false,
    expect: '/link',
  },
  {
    href: '/link/',
    trailingSlash: true,
    expect: '/link/',
  },
  {
    href: '/link/index.mdx',
    trailingSlash: false,
    expect: '/link',
  },
  {
    href: '/link/index.mdx',
    trailingSlash: true,
    expect: '/link/',
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
].forEach((t) => {
  test(`getMarkdownRelativeUrl ${t.href}`, () => {
    const opts: NormalizedPluginOptions = {
      basePathname: '/',
      trailingSlash: !!t.trailingSlash,
      routesDir,
      serverPluginsDir,
      mdxPlugins: {
        remarkGfm: true,
        rehypeSyntaxHighlight: true,
        rehypeAutolinkHeadings: true,
      },
      mdx: {},
      platform: {},
      rewriteRoutes: [],
    };
    equal(getMarkdownRelativeUrl(opts, menuFilePath, t.href), t.expect);
  });
});

test.run();
