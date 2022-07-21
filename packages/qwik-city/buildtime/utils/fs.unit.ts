import * as assert from 'uvu/assert';
import * as utils from './fs';
import { suite } from './test-suite';

const test = suite();

test('parseLayoutId, nested', () => {
  const { layoutName, layoutType } = utils.parseLayoutId('_layout.tsx');
  assert.is(layoutName, '');
  assert.is(layoutType, 'nested');
});

test('parseLayoutId, top', () => {
  const { layoutName, layoutType } = utils.parseLayoutId('_layout!.tsx');
  assert.is(layoutName, '');
  assert.is(layoutType, 'top');
});

test('parseLayoutId, named layout, nested', () => {
  const { layoutName, layoutType } = utils.parseLayoutId('_layout-foo.tsx');
  assert.is(layoutName, 'foo');
  assert.is(layoutType, 'nested');
});

test('parseLayoutId, named layout, top', () => {
  const { layoutName, layoutType } = utils.parseLayoutId('_layout-foo!.tsx');
  assert.is(layoutName, 'foo');
  assert.is(layoutType, 'top');
});

test.run();
