import { basename, dirname } from 'path';
import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';

const test = testAppSuite('Build Pages');

test('layoutStop file', ({ assertPage }) => {
  const r = assertPage('/mit');
  assert.equal(r.id, 'Mit');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/mit\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 0);
});

test('pathless directory', ({ assertPage }) => {
  const r = assertPage('/sign-in');
  assert.equal(r.id, 'AuthSignin');
  assert.equal(r.type, 'page');
  assert.equal(basename(dirname(r.filePath)), '__auth');
  assert.equal(r.pattern, /^\/sign-in\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'AuthLayout');
});

test('index file w/ nested named layout, in directory w/ nested named layout', ({ assertPage }) => {
  const r = assertPage('/api');
  assert.equal(r.id, 'ApiIndexfoo');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/api\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutName, '');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts[1].id, 'ApiLayoutfooIndex');
  assert.equal(r.layouts[1].layoutName, 'foo');
  assert.equal(r.layouts[1].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('index file w/out named layout, in directory w/ named layout', ({ assertPage }) => {
  const r = assertPage('/dashboard');
  assert.equal(r.id, 'DashboardIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 1);
});

test('file w/ named layout, in directory w/ nested named layout file', ({ assertPage }) => {
  const r = assertPage('/dashboard/profile');
  assert.equal(r.id, 'DashboardProfiledashboard');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/profile\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts[1].id, 'DashboardLayoutdashboard');
  assert.equal(r.layouts[1].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('index file w/ named layout, in directory w/ nested named layout file', ({ assertPage }) => {
  const r = assertPage('/dashboard/settings');
  assert.equal(r.id, 'DashboardSettingsIndexdashboard');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/settings\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts[1].id, 'DashboardLayoutdashboard');
  assert.equal(r.layouts[1].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('params route, index file w/out named layout, in directory w/ top layout directory', ({
  assertPage,
}) => {
  const r = assertPage('/docs/[category]/[id]');
  assert.equal(r.id, 'DocsCategoryIdIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(r.paramNames.length, 2);
  assert.equal(r.paramNames[0], 'category');
  assert.equal(r.paramNames[1], 'id');
  assert.equal(r.layouts[0].id, 'DocsLayoutIndex');
  assert.equal(r.layouts.length, 1);
});

test('markdown index file w/out named layout, in directory w/ top layout directory', ({
  assertPage,
}) => {
  const r = assertPage('/docs/overview');
  assert.equal(r.id, 'DocsOverviewIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/docs\/overview\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'DocsLayoutIndex');
  assert.equal(r.layouts.length, 1);
});

test('markdown file w/out named layout, in directory w/ top layout directory', ({ assertPage }) => {
  const r = assertPage('/docs/getting-started');
  assert.equal(r.id, 'DocsGettingstarted');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/docs\/getting-started\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'DocsLayoutIndex');
  assert.equal(r.layouts.length, 1);
});

test('index file w/out named layout, in directory w/ top layout directory', ({ assertPage }) => {
  const r = assertPage('/docs');
  assert.equal(r.id, 'DocsIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/docs\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'DocsLayoutIndex');
  assert.equal(r.layouts[0].layoutName, '');
  assert.equal(r.layouts[0].layoutType, 'top');
  assert.equal(r.layouts.length, 1);
});

test('named file w/out named layout, in directory w/ layout directory', ({ assertPage }) => {
  const r = assertPage('/about-us');
  assert.equal(r.id, 'Aboutus');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/about-us\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 1);
});

test('named tsx file', ({ assertPage }) => {
  const r = assertPage('/about-us');
  assert.equal(r.id, 'Aboutus');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/about-us\/?$/);
  assert.equal(r.paramNames.length, 0);
});

test('root index', ({ assertPage }) => {
  const r = assertPage('/');
  assert.equal(r.id, 'Index');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.paramNames.length, 0);
});

test.run();
