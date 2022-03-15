import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { join } from 'path';
import { suite } from './uvu-suite';

const test = suite();

test('missing title, use filename', ({ opts, attrs }) => {
  const filename = join(opts.pagesDir, 'dir', 'doc-name.mdx');
  delete attrs.title;
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('empty title, use filename', ({ opts, attrs }) => {
  const filename = join(opts.pagesDir, 'dir', 'doc-name.mdx');
  attrs.title = '';
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('null title, use filename', ({ opts, attrs }) => {
  const filename = join(opts.pagesDir, 'dir', 'doc-name.mdx');
  attrs.title = null as any;
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('title from attributes', ({ opts, attrs }) => {
  const filename = join(opts.pagesDir, 'dir', 'doc-name.mdx');
  attrs.title = 'Doc Title';
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Title');
});

test.run();
