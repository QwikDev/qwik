import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { join } from 'path';
import { suite } from './uvu-suite';

const test = suite();

test('pathname from index.mdx', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'index.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/');
});

test('pathname from index.mdx, trailingSlash', ({ ctx }) => {
  ctx.opts.trailingSlash = true;
  const filePath = join(ctx.opts.pagesDir, 'index.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/');
});

test('pathname from index.md', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'index.md');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/');
});

test('index in subdirectory, trailingSlash', ({ ctx }) => {
  ctx.opts.trailingSlash = true;
  const filePath = join(ctx.opts.pagesDir, 'Dir', 'index.md');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/dir/');
});

test('index in subdirectory', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'Dir', 'index.md');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/dir');
});

test('pathname from page.mdx', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'page.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/page');
});

test('pathname from page.mdx, trailingSlash', ({ ctx }) => {
  ctx.opts.trailingSlash = true;
  const filePath = join(ctx.opts.pagesDir, 'page.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/page/');
});

test('pathname from dir/page.mdx', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'dir', 'page.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/dir/page');
});

test('pathname from dir/page.mdx, trailingSlash', ({ ctx }) => {
  ctx.opts.trailingSlash = true;
  const filePath = join(ctx.opts.pagesDir, 'dir', 'page.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/dir/page/');
});

test('pathname from slug_ify/ME__.mdx', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'sl u g_ify', 'ME.mdx');
  const p = utils.getPagePathname(ctx, filePath);
  assert.is(p, '/sl-u-g-ify/me');
});

test('index pathname from guide/README.md', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexPathname(ctx, filePath);
  assert.is(p, '/guide');
});

test('index pathname from a/b/c/README.md', ({ ctx }) => {
  const filePath = join(ctx.opts.pagesDir, 'a', 'b', 'c', 'README.md');
  const p = utils.getIndexPathname(ctx, filePath);
  assert.is(p, '/a/b/c');
});

test('index pathname from guide/README.md, trailingSlash', ({ ctx }) => {
  ctx.opts.trailingSlash = true;
  const filePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexPathname(ctx, filePath);
  assert.is(p, '/guide/');
});

test('index href guides/getting-started.mdx', ({ ctx }) => {
  const href = './getting-started.mdx';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, '/guide/getting-started');
});

test('index href guides/getting-started.mdx?intro', ({ ctx }) => {
  const href = './getting-started.mdx?intro';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'components', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started?intro');
});

test('index href guides/getting-started.mdx#intro', ({ ctx }) => {
  const href = './getting-started.mdx#intro';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'components', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started#intro');
});

test('index href /link', ({ ctx }) => {
  const href = '/link';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, '/link');
});

test('index href http://builder.io/', ({ ctx }) => {
  const href = 'http://builder.io/';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, 'http://builder.io/');
});

test('index href ./getting-started.txt', ({ ctx }) => {
  const href = './getting-started.txt';
  const indexFilePath = join(ctx.opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(ctx, indexFilePath, href);
  assert.is(p, './getting-started.txt');
});

test('js module / path', () => {
  const p = utils.getPagesBuildPath('/');
  assert.is(p, 'pages/index.js');
});

test('js module /basics path', () => {
  const p = utils.getPagesBuildPath('/basics');
  assert.is(p, 'pages/basics/index.js');
});

test('js module /basics/index path', () => {
  const p = utils.getPagesBuildPath('/basics/index');
  assert.is(p, 'pages/basics/index.js');
});

test.run();
