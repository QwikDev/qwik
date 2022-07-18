import { tmpdir } from 'os';
import { join } from 'path';
import * as assert from 'uvu/assert';
import * as utils from './fs';
import { suite } from './test-suite';

const test = suite();

test('createFileId, Page index.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'index.tsx'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'Index');
});

test('createFileId, Page dir/index.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'docs', 'index.tsx'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'DocsIndex');
});

test('createFileId, Page about-us.tsx', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'about-us.tsx'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'Aboutus');
});

test('createFileId, Endpoint, api/[user]/index.ts', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'api', '[user]', 'index.ts'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'ApiUserIndex');
});

test('createFileId, Endpoint, data.json.ts', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'api', 'data.json.ts'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'ApiDatajson');
});

test('createFileId, Layout', () => {
  const rootDir = tmpdir();
  const routesDir = utils.normalizePath(join(rootDir, 'src', 'routes'));
  const path = utils.normalizePath(join(routesDir, 'dashboard', 'settings', '_layout.tsx'));
  const p = utils.createFileId(routesDir, path);
  assert.is(p, 'DashboardSettingsLayout');
});

test.run();
