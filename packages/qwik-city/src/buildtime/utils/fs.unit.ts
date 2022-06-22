import { tmpdir } from 'os';
import { join } from 'path';
import * as assert from 'uvu/assert';
import { createBuildContext } from './context';
import * as utils from './fs';
import { suite } from './test-suite';

const test = suite();

test('js module / path', () => {
  const p = utils.getPagesBuildPath('/');
  assert.is(p, 'pages/index.js');
});

test('js module /basics path', () => {
  const p = utils.getPagesBuildPath('/basics');
  assert.is(p, 'pages/basics/index.js');
});

test('js module /basics/index path', () => {
  const p = utils.getPagesBuildPath('/basics/index');
  assert.is(p, 'pages/basics/index.js');
});

test('createFileId, Page index.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'index.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Page');
  assert.is(p, 'QCPageIndex');
});

test('createFileId, Page dir/index.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'docs', 'index.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Page');
  assert.is(p, 'QCPageDocsIndex');
});

test('createFileId, Page about-us.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'about-us.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Page');
  assert.is(p, 'QCPageAboutus');
});

test('createFileId, Endpoint, api/[user]/index.ts', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'api', '[user]', 'index.ts'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Endpoint');
  assert.is(p, 'QCEndpointApiUserIndex');
});

test('createFileId, Endpoint, data.json.ts', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'api', 'data.json.ts'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Endpoint');
  assert.is(p, 'QCEndpointApiDatajson');
});

test('createFileId, Layout', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'dashboard', 'settings', '_layout.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path, 'Layout');
  assert.is(p, 'QCLayoutDashboardSettings');
});

test.run();
