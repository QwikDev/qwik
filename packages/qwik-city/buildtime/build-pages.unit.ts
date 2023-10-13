import { assert } from 'vitest';
import { testAppSuite } from '../utils/test-suite';

const test = testAppSuite('Build Pages');

test('layoutStop file', ({ assertRoute }) => {
  const r = assertRoute('/mit/');
  assert.equal(r.id, 'CommonMitRoute');
  assert.deepEqual(r.pattern, /^\/mit\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 0);
});

test('pathless directory', ({ assertRoute }) => {
  const r = assertRoute('/sign-in/');
  assert.equal(r.id, 'CommonAuthSigninRoute');
  assert.deepEqual(r.pattern, /^\/sign-in\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts.length, 3);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[1].id, 'CommonLayout');
  assert.equal(r.layouts[2].id, 'CommonAuthLayout');
});

test('index file w/ nested named layout, in directory w/ nested named layout', ({
  assertRoute,
}) => {
  const r = assertRoute('/api/');
  assert.equal(r.id, 'CommonApiIndexapiRoute');
  assert.deepEqual(r.pattern, /^\/api\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutName, '');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts[1].id, 'CommonLayout');
  assert.equal(r.layouts[1].layoutName, '');
  assert.equal(r.layouts[1].layoutType, 'nested');
  assert.equal(r.layouts.length, 3);
});

test('index file w/out named layout, in directory w/ named layout', ({ assertRoute }) => {
  const r = assertRoute('/dashboard/');
  assert.equal(r.id, 'DashboardRoute');
  assert.deepEqual(r.pattern, /^\/dashboard\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('index file in directory w/ nested named layout file', ({ assertRoute }) => {
  const r = assertRoute('/dashboard/profile/');
  assert.equal(r.id, 'DashboardProfileRoute');
  assert.deepEqual(r.pattern, /^\/dashboard\/profile\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('index file in directory w/ top named layout file', ({ assertRoute }) => {
  const r = assertRoute('/dashboard/settings/');
  assert.equal(r.id, 'DashboardSettingsRoute');
  assert.deepEqual(r.pattern, /^\/dashboard\/settings\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('params route, index file w/out named layout, in directory w/ top layout directory', ({
  assertRoute,
}) => {
  const r = assertRoute('/docs/[category]/[id]/');
  assert.equal(r.id, 'DocsCategoryIdRoute');
  assert.deepEqual(r.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(r.paramNames.length, 2);
  assert.equal(r.paramNames[0], 'category');
  assert.equal(r.paramNames[1], 'id');
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts.length, 2);
});

test('markdown index file w/out named layout, in directory w/ top layout directory', ({
  assertRoute,
}) => {
  const r = assertRoute('/docs/overview/');
  assert.equal(r.id, 'DocsOverviewRoute');
  assert.deepEqual(r.pattern, /^\/docs\/overview\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts.length, 2);
});

test('markdown file w/out named layout, in directory w/ top layout directory', ({
  assertRoute,
}) => {
  const r = assertRoute('/docs/getting-started/');
  assert.equal(r.id, 'DocsGettingstartedRoute');
  assert.deepEqual(r.pattern, /^\/docs\/getting-started\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts.length, 2);
});

test('index file w/out named layout, in directory w/ top layout directory', ({ assertRoute }) => {
  const r = assertRoute('/docs/');
  assert.equal(r.id, 'DocsRoute');
  assert.deepEqual(r.pattern, /^\/docs\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutName, '');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('named file w/out named layout, in directory w/ layout directory', ({ assertRoute }) => {
  const r = assertRoute('/about-us/');
  assert.equal(r.id, 'CommonAboutusRoute');
  assert.deepEqual(r.pattern, /^\/about-us\/?$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.layouts[0].id, 'Layout');
  assert.equal(r.layouts[0].layoutType, 'nested');
  assert.equal(r.layouts.length, 2);
});

test('named tsx file', ({ assertRoute }) => {
  const r = assertRoute('/about-us/');
  assert.equal(r.id, 'CommonAboutusRoute');
  assert.deepEqual(r.pattern, /^\/about-us\/?$/);
  assert.equal(r.paramNames.length, 0);
});

test('root index', ({ assertRoute }) => {
  const r = assertRoute('/');
  assert.equal(r.id, 'CommonRoute');
  assert.deepEqual(r.pattern, /^\/$/);
  assert.equal(r.paramNames.length, 0);
  assert.equal(r.paramNames.length, 0);
});
