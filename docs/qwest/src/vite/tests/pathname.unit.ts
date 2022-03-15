import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { join } from 'path';
import { suite } from './uvu-suite';

const test = suite();

test('pathname from index.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'index.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.pagesDir, 'index.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.md', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'index.md');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/');
});

test('index in subdirectory not allowed', ({ opts }) => {
  assert.throws(() => {
    const filePath = join(opts.pagesDir, 'Dir', 'index.md');
    const p = utils.getPagePathname(opts, filePath);
    assert.is(p, '/dir');
  });
});

test('pathname from page.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'page.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/page');
});

test('pathname from page.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.pagesDir, 'page.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/page/');
});

test('pathname from dir/page.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'dir', 'page.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/dir/page');
});

test('pathname from dir/page.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.pagesDir, 'dir', 'page.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/dir/page/');
});

test('pathname from slug_ify/ME__.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'sl u g_ify', 'ME.mdx');
  const p = utils.getPagePathname(opts, filePath);
  assert.is(p, '/sl-u-g-ify/me');
});

test('index pathname from guide/README.md', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexPathname(opts, filePath);
  assert.is(p, '/guide');
});

test('index pathname from a/b/c/README.md', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'a', 'b', 'c', 'README.md');
  const p = utils.getIndexPathname(opts, filePath);
  assert.is(p, '/a/b/c');
});

test('index pathname from guide/README.md, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexPathname(opts, filePath);
  assert.is(p, '/guide/');
});

test('index href guides/getting-started.mdx', ({ opts }) => {
  const href = './getting-started.mdx';
  const indexFilePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/getting-started');
});

test('index href guides/getting-started.mdx?intro', ({ opts }) => {
  const href = './getting-started.mdx?intro';
  const indexFilePath = join(opts.pagesDir, 'guide', 'components', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started?intro');
});

test('index href guides/getting-started.mdx#intro', ({ opts }) => {
  const href = './getting-started.mdx#intro';
  const indexFilePath = join(opts.pagesDir, 'guide', 'components', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started#intro');
});

test('index href /link', ({ opts }) => {
  const href = '/link';
  const indexFilePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, '/link');
});

test('index href http://builder.io/', ({ opts }) => {
  const href = 'http://builder.io/';
  const indexFilePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, 'http://builder.io/');
});

test('index href ./getting-started.txt', ({ opts }) => {
  const href = './getting-started.txt';
  const indexFilePath = join(opts.pagesDir, 'guide', 'README.md');
  const p = utils.getIndexLinkHref(opts, indexFilePath, href);
  assert.is(p, './getting-started.txt');
});

test.run();
