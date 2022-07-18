import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';
import { basename, dirname } from 'path';

const test = testAppSuite('Build Layout');

test('total layouts', ({ layouts }) => {
  assert.is(layouts.length, 6, JSON.stringify(layouts, null, 2));
});

test('filename layout', ({ assertLayout }) => {
  const l = assertLayout('AuthLayout');
  assert.is(basename(l.filePath), '_layout.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.layoutName, '');
});

test('directory layout', ({ assertLayout }) => {
  const l = assertLayout('BlogLayoutIndex');
  assert.is(basename(dirname(l.filePath)), '_layout');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.layoutName, '');
});

test('named filename layout', ({ assertLayout }) => {
  const l = assertLayout('DashboardLayoutdashboard');
  assert.is(basename(l.filePath), '_layout-dashboard.tsx');
  assert.is(l.type, 'top');
  assert.is(l.layoutName, 'dashboard');
});

test('nested directory layout', ({ assertLayout }) => {
  const l = assertLayout('DocsLayoutIndex');
  assert.is(basename(dirname(l.filePath)), '_layout');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'nested');
  assert.is(l.layoutName, '');
});

test('named directory layout', ({ assertLayout }) => {
  const l = assertLayout('ApiLayoutfooIndex');
  assert.is(basename(dirname(l.filePath)), '_layout-foo');
  assert.is(basename(l.filePath), 'index.tsx');
  assert.is(l.type, 'top');
  assert.is(l.layoutName, 'foo');
});

test.run();
