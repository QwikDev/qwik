import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';
import { basename, dirname } from 'path';

const test = testAppSuite('Build Layout');

test('total layouts', ({ layouts }) => {
  assert.is(layouts.length, 6, JSON.stringify(layouts, null, 2));
});

test('filename layout', ({ getLayout }) => {
  const l = getLayout('AuthLayout');
  assert.is(basename(l.filePath), '_layout.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.name, '');
});

test('directory layout', ({ getLayout }) => {
  const l = getLayout('BlogLayoutIndex');
  assert.is(basename(dirname(l.filePath)), '_layout');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.name, '');
});

test('named filename layout', ({ getLayout }) => {
  const l = getLayout('DashboardLayoutdashboard');
  assert.is(basename(l.filePath), '_layout-dashboard.tsx');
  assert.is(l.type, 'top');
  assert.is(l.name, 'dashboard');
});

test('nested directory layout', ({ getLayout }) => {
  const l = getLayout('DocsLayoutIndex');
  assert.is(basename(dirname(l.filePath)), '_layout');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.name, '');
});

test('named directory layout', ({ getLayout }) => {
  const l = getLayout('ApiLayoutfooIndex');
  assert.is(basename(dirname(l.filePath)), '_layout-foo');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'top');
  assert.is(l.name, 'foo');
});

test.run();
