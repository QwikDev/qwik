import * as assert from 'uvu/assert';
import * as utils from './pathname';
import { join } from 'path';
import { suite } from './test-suite';

const test = suite();

test('pathname from index.tsx', ({ opts }) => {
  const filePath = join(opts.routesDir, 'index.tsx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.mdx', ({ opts }) => {
  const filePath = join(opts.routesDir, 'index.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'index.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.tsx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'index.tsx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/');
});

test('pathname from index.md', ({ opts }) => {
  const filePath = join(opts.routesDir, 'index.md');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/');
});

test('index in subdirectory, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'dir', 'index.md');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/dir/');
});

test('index in subdirectory', ({ opts }) => {
  const filePath = join(opts.routesDir, 'dir', 'index.md');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/dir');
});

test('pathname from page.mdx', ({ opts }) => {
  const filePath = join(opts.routesDir, 'page.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/page');
});

test('pathname from page.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'page.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/page/');
});

test('pathname from dir/page.mdx', ({ opts }) => {
  const filePath = join(opts.routesDir, 'dir', 'page.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/dir/page');
});

test('pathname from dir/page.mdx, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'dir', 'page.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/dir/page/');
});

test('pathname with pathless directories', ({ opts }) => {
  const filePath = join(opts.routesDir, '__pathless', 'account', '__route', 'sign-up.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/account/sign-up');
});

test('pathname with pathless directories,trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, '__pathless', 'account', '__route', 'sign-up.mdx');
  const p = utils.getPathnameFromFilePath(opts, filePath);
  assert.is(p, '/account/sign-up/');
});

test('menu pathname from guide/menu.md', ({ opts }) => {
  const filePath = join(opts.routesDir, 'guide', 'menu.md');
  const p = utils.getMenuPathname(opts, filePath);
  assert.is(p, '/guide');
});

test('menu pathname from a/b/c/menu.md', ({ opts }) => {
  const filePath = join(opts.routesDir, 'a', 'b', 'c', 'menu.md');
  const p = utils.getMenuPathname(opts, filePath);
  assert.is(p, '/a/b/c');
});

test('menu pathname from guide/menu.md, trailingSlash', ({ opts }) => {
  opts.trailingSlash = true;
  const filePath = join(opts.routesDir, 'guide', 'menu.md');
  const p = utils.getMenuPathname(opts, filePath);
  assert.is(p, '/guide/');
});

test('index href guides/getting-started.mdx', ({ opts }) => {
  const href = './getting-started.mdx';
  const indexFilePath = join(opts.routesDir, 'guide', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/getting-started');
});

test('index href guides/getting-started.mdx?intro', ({ opts }) => {
  const href = './getting-started.mdx?intro';
  const indexFilePath = join(opts.routesDir, 'guide', 'components', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started?intro');
});

test('index href guides/getting-started.mdx#intro', ({ opts }) => {
  const href = './getting-started.mdx#intro';
  const indexFilePath = join(opts.routesDir, 'guide', 'components', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, '/guide/components/getting-started#intro');
});

test('index href /link', ({ opts }) => {
  const href = '/link';
  const indexFilePath = join(opts.routesDir, 'guide', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, '/link');
});

test('index href http://builder.io/', ({ opts }) => {
  const href = 'http://builder.io/';
  const indexFilePath = join(opts.routesDir, 'guide', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, 'http://builder.io/');
});

test('index href ./getting-started.txt', ({ opts }) => {
  const href = './getting-started.txt';
  const indexFilePath = join(opts.routesDir, 'guide', 'README.md');
  const p = utils.getMenuLinkHref(opts, indexFilePath, href);
  assert.is(p, './getting-started.txt');
});

test.run();
