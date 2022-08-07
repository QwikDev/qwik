import { tmpdir } from 'os';
import { join } from 'path';
import { test } from 'uvu';
import { equal } from 'uvu/assert';
import { createFileId, normalizePath } from './fs';

const routesDir = normalizePath(join(tmpdir(), 'src', 'routes'));

test('createFileId, Page dir/index.tsx', () => {
  const path = normalizePath(join(routesDir, 'docs', 'index.tsx'));
  const p = createFileId(routesDir, path);
  equal(p, 'Docs');
});

test('createFileId, Page about-us.tsx', () => {
  const path = normalizePath(join(routesDir, 'about-us', 'index.tsx'));
  const p = createFileId(routesDir, path);
  equal(p, 'Aboutus');
});

test('createFileId, Endpoint, api/[user]/index.ts', () => {
  const path = normalizePath(join(routesDir, 'api', '[user]', 'index.ts'));
  const p = createFileId(routesDir, path);
  equal(p, 'ApiUser');
});

test('createFileId, Endpoint, data.json.ts', () => {
  const path = normalizePath(join(routesDir, 'api', 'data.json', 'index.ts'));
  const p = createFileId(routesDir, path);
  equal(p, 'ApiData');
});

test('createFileId, Layout', () => {
  const path = normalizePath(join(routesDir, 'dashboard', 'settings', 'layout.tsx'));
  const p = createFileId(routesDir, path);
  equal(p, 'DashboardSettingsLayout');
});

test.run();
