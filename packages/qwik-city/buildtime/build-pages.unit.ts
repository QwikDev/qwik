import { basename, dirname } from 'path';
import * as assert from 'uvu/assert';
import { testAppSuite } from './utils/test-suite';

const test = testAppSuite('Build Pages');

test('pathless directory', ({ getPage }) => {
  const r = getPage('/sign-in');
  assert.equal(r.id, 'AuthSignin');
  assert.equal(r.source, 'module');
  assert.equal(r.type, 'page');
  assert.equal(basename(dirname(r.filePath)), '__auth');
  assert.equal(r.pattern, /^\/sign-in\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'AuthLayout');
});

test('index file w/ named layout, in directory w/ named layout', ({ getPage, layouts }) => {
  const r = getPage('/api');
  assert.equal(r.id, 'ApiIndexfoo');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/api\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 1);
  assert.equal(r.layouts[0].id, 'ApiLayoutfooIndex');
});

test('file w/out named layout, in directory w/ named layout', ({ getPage }) => {
  const r = getPage('/dashboard');
  assert.equal(r.id, 'DashboardIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 1);
  assert.equal(r.layouts[0].id, 'Layout');
});

test('file w/ named layout, in directory w/ named layout', ({ getPage }) => {
  const r = getPage('/dashboard/profile');
  assert.equal(r.id, 'DashboardProfiledashboard');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/profile\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 1);
  assert.equal(r.layouts[0].id, 'DashboardLayoutdashboard');
});

test('index file w/ named layout, in directory w/ named layout', ({ getPage }) => {
  const r = getPage('/dashboard/settings');
  assert.equal(r.id, 'DashboardSettingsIndexdashboard');
  assert.equal(r.type, 'page');
  assert.equal(r.pattern, /^\/dashboard\/settings\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 1);
  assert.equal(r.layouts[0].id, 'DashboardLayoutdashboard');
  assert.equal(r.layouts[0].type, 'top');
});

test('params route, index file w/out named layout, in directory w/ layout directory', ({
  getPage,
}) => {
  const r = getPage('/docs/[category]/[id]');
  assert.equal(r.id, 'DocsCategoryIdIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.source, 'module');
  assert.equal(r.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(r.paramNames.length, 2);
  assert.equal(r.paramNames[0], 'category');
  assert.equal(r.paramNames[1], 'id');
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'DocsLayoutIndex');
});

test('markdown index file w/out named layout, in directory w/ layout directory', ({ getPage }) => {
  const r = getPage('/docs/overview');
  assert.equal(r.id, 'DocsOverviewIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.source, 'markdown');
  assert.equal(r.pattern, /^\/docs\/overview\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'DocsLayoutIndex');
});

test('markdown file w/out named layout, in directory w/ layout directory', ({ getPage }) => {
  const r = getPage('/docs/getting-started');
  assert.equal(r.id, 'DocsGettingstarted');
  assert.equal(r.type, 'page');
  assert.equal(r.source, 'markdown');
  assert.equal(r.pattern, /^\/docs\/getting-started\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'DocsLayoutIndex');
});

test('index file w/out named layout, in directory w/ layout directory', ({ getPage }) => {
  const r = getPage('/docs');
  assert.equal(r.id, 'DocsIndex');
  assert.equal(r.type, 'page');
  assert.equal(r.source, 'module');
  assert.equal(r.pattern, /^\/docs\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 2);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'DocsLayoutIndex');
});

test('index file w/out named layout, in directory w/ layout directory', ({ getPage }) => {
  const r = getPage('/about-us');
  assert.equal(r.id, 'Aboutus');
  assert.equal(r.type, 'page');
  assert.equal(r.source, 'module');
  assert.equal(r.pattern, /^\/about-us\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 1);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].type, 'nested');
});

// const aboutUs = getPageRoute('/about-us');
// assert.equal(aboutUs.id, 'Aboutus');
// assert.equal(aboutUs.type, 'page');
// assert.equal(aboutUs.pattern, /^\/about-us\/?$/);
// assert.equal(aboutUs.paramNames.length, 0);

// const index = getPageRoute('/');
// assert.equal(index.id, 'Index');
// assert.equal(index.type, 'page');
// assert.equal(index.pattern, /^\/$/);
// assert.equal(index.paramNames.length, 0);
// assert.equal(index.paramNames.length, 0);

// const layouts = ctx.layouts;
// assert.is(layouts.length, 4, 'total layouts');
// const blogLayout = layouts.find((r) => r.id === 'BlogLayout')!;
// assert.ok(blogLayout, 'found blog layout');
// assert.is(blogLayout.type, 'nested');
// assert.is(blogLayout.name, '');

// const dashboardLayout = layouts.find((r) => r.id === 'DashboardLayout')!;
// assert.ok(dashboardLayout, 'found dashboard layout');
// assert.is(dashboardLayout.type, 'nested');
// assert.is(dashboardLayout.name, '');

// const docsLayout = layouts.find((r) => r.id === 'DocsLayoutdocsIndex')!;
// assert.ok(docsLayout, 'found docs layout');
// assert.is(docsLayout.type, 'top');
// assert.is(dashboardLayout.name, 'docs');

// const rootLayout = layouts.find((r) => r.id === 'Layoutnested')!;
// assert.ok(rootLayout, 'found top layout');
// assert.is(rootLayout.type, 'nested');

test.run();
