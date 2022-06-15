import { join } from 'path';
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { build } from './build';
import { createBuildContext } from './utils/context';
import { normalizePath } from './utils/fs';

const testRootDir = join(__dirname, '..', 'test');

test('build routes', async () => {
  const ctx = createBuildContext(testRootDir);

  assert.is(normalizePath(testRootDir), ctx.rootDir);
  assert.is(normalizePath(join(testRootDir, 'src', 'routes')), ctx.opts.routesDir);

  await build(ctx);

  const routes = ctx.routes;

  const index = routes.find((r) => r.pathname === '/');
  assert.equal(index?.id, 'Index');
  assert.equal(index?.type, 'page');
  assert.equal(index?.pattern, /^\/$/);
  assert.equal(index?.paramNames.length, 0);

  const aboutUs = routes.find((r) => r.pathname === '/about-us');
  assert.equal(aboutUs?.id, 'IndexAboutus');
  assert.equal(aboutUs?.type, 'page');
  assert.equal(aboutUs?.pattern, /^\/about-us\/?$/);
  assert.equal(aboutUs?.paramNames.length, 0);

  const docsOverview = routes.find((r) => r.pathname === '/docs/overview');
  assert.equal(docsOverview?.id, 'IndexDocsOverview');
  assert.equal(docsOverview?.type, 'page');
  assert.equal(docsOverview?.pattern, /^\/docs\/overview\/?$/);
  assert.equal(docsOverview?.paramNames.length, 0);

  const api = routes.find((r) => r.pathname === '/api/[org]/[user].json');
  assert.equal(api?.id, 'EndpointApiOrgUserjson');
  assert.equal(api?.type, 'endpoint');
  assert.equal(api?.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json$/);
  assert.equal(api?.paramNames.length, 2);
  assert.equal(api?.paramNames[0], 'org');
  assert.equal(api?.paramNames[1], 'user');

  const docsCategory = routes.find((r) => r.pathname === '/docs/[category]/[id]');
  assert.equal(docsCategory?.id, 'IndexDocsCategoryId');
  assert.equal(docsCategory?.type, 'page');
  assert.equal(docsCategory?.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(docsCategory?.paramNames.length, 2);
  assert.equal(docsCategory?.paramNames[0], 'category');
  assert.equal(docsCategory?.paramNames[1], 'id');
});
