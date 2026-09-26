import { getMarkdownRelativeUrl } from './markdown-url';
import type { NormalizedPluginOptions } from '../types';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, test, vi } from 'vitest';
import { fileURLToPath } from 'node:url';

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
  test(`getMarkdownRelativeUrl ${t.href} ${t.trailingSlash ? 'with' : 'without'} slash`, () => {
    const opts: NormalizedPluginOptions = {
      basePathname: '/',
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
      ignoreRoutes: [],
      defaultLoadersSerializationStrategy: 'never',
      strictLoaders: true,
    };
    globalThis.__NO_TRAILING_SLASH__ = !t.trailingSlash;
    assert.equal(getMarkdownRelativeUrl(opts, menuFilePath, t.href), t.expect);
  });
});

test('a markdown link to an ignored page warns about the dead link', () => {
  const appRoutesDir = join(
    fileURLToPath(new URL('.', import.meta.url)),
    '../../../../../e2e/qwik-e2e/apps/qwikrouter-test/src/routes'
  );
  const opts = {
    basePathname: '/',
    routesDir: appRoutesDir,
    serverPluginsDir: appRoutesDir,
    mdxPlugins: { remarkGfm: true, rehypeSyntaxHighlight: true, rehypeAutolinkHeadings: true },
    mdx: {},
    platform: {},
    rewriteRoutes: [],
    ignoreRoutes: ['docs/overview/**'],
    defaultLoadersSerializationStrategy: 'never' as const,
    strictLoaders: true,
  };
  const warnings: string[] = [];
  const warnSpy = vi
    .spyOn(console, 'warn')
    .mockImplementation((m) => void warnings.push(String(m)));

  const menuPath = join(appRoutesDir, 'docs', 'menu.md');
  getMarkdownRelativeUrl(opts, menuPath, './overview/index.md', true);
  getMarkdownRelativeUrl(opts, menuPath, './getting-started/index.md', true);

  warnSpy.mockRestore();
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /ignoreRoutes/);
  assert.match(warnings[0], /overview\/index\.md/);
});
