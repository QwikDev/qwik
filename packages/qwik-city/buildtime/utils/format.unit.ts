import * as assert from 'uvu/assert';
import * as utils from './format';
import { join } from 'path';
import { suite } from './test-suite';

const test = suite();

test('missing title, use filename', ({ ctx, attrs }) => {
  const filename = join(ctx.opts.routesDir, 'dir', 'doc-name.mdx');
  delete attrs.title;
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('empty title, use filename', ({ ctx, attrs }) => {
  const filename = join(ctx.opts.routesDir, 'dir', 'doc-name.mdx');
  attrs.title = '';
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('null title, use filename', ({ ctx, attrs }) => {
  const filename = join(ctx.opts.routesDir, 'dir', 'doc-name.mdx');
  attrs.title = null as any;
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Name');
});

test('title from attributes', ({ ctx, attrs }) => {
  const filename = join(ctx.opts.routesDir, 'dir', 'doc-name.mdx');
  attrs.title = 'Doc Title';
  const p = utils.getPageTitle(filename, attrs);
  assert.is(p, 'Doc Title');
});

test.run();
