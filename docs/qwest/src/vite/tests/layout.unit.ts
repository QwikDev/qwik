import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { suite } from './uvu-suite';

const test = suite();

test('ok if default', ({ ctx, filePath, attrs }) => {
  attrs.layout = 'default';
  utils.validateLayout(ctx, filePath, attrs);
});

test('ok if layout exists', ({ ctx, filePath, attrs }) => {
  attrs.layout = 'full';
  ctx.opts.layouts.full = '/path/to/layout.tsx';
  utils.validateLayout(ctx, filePath, attrs);
});

test('error if not valid', ({ ctx, filePath, attrs }) => {
  assert.throws(() => {
    attrs.layout = 'nope';
    utils.validateLayout(ctx, filePath, attrs);
  });
});

test.run();
