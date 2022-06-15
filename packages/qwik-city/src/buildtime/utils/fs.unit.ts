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

test('createFileId, Index', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'index.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path);
  assert.is(p, 'Index');
});

test('createFileId, Endpoint', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'api', '[user]', 'endpoint.ts'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path);
  assert.is(p, 'EndpointApiUser');
});

test('createFileId, Layout', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'dashboard', 'settings', 'layout.tsx'));
  const ctx = createBuildContext(routesDir);
  const p = utils.createFileId(ctx, routesDir, path);
  assert.is(p, 'LayoutDashboardSettings');
});

test.run();
