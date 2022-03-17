import * as assert from 'uvu/assert';
import * as utils from '../utils';
import { suite } from './uvu-suite';

const test = suite();

test('ok if default', ({ opts, filePath, attrs }) => {
  attrs.layout = 'default';
  utils.validateLayout(opts, filePath, attrs);
});

test('ok if layout exists', ({ opts, filePath, attrs }) => {
  attrs.layout = 'full';
  opts.layouts.full = '/path/to/layout.tsx';
  utils.validateLayout(opts, filePath, attrs);
});

test('error if not valid', ({ opts, filePath, attrs }) => {
  assert.throws(() => {
    attrs.layout = 'nope';
    utils.validateLayout(opts, filePath, attrs);
  });
});

test.run();
