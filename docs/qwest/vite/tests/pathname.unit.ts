import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { join } from 'path';
import { suite } from './uvu-suite';

const test = suite();

test('permalink must start with /', ({ opts, filePath }) => {
  assert.throws(() => {
    utils.getPagePathname(opts, filePath, { permalink: 'nope' });
  });
});

test('pathname from index.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'index.mdx');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/');
});

test('pathname from index.md', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'index.md');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/');
});

test('pathname from dir/index.md', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'Dir', 'index.md');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/dir');
});

test('pathname from page.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'page.mdx');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/page');
});

test('pathname from dir/page.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'dir', 'page.mdx');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/dir/page');
});

test('pathname from slug_ify/ME__.mdx', ({ opts }) => {
  const filePath = join(opts.pagesDir, 'sl u g_ify', 'ME.mdx');
  const p = utils.getPagePathname(opts, filePath, {});
  assert.is(p, '/sl-u-g-ify/me');
});

test.run();
