import { join } from 'path';
import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { build } from './build';
import { createBuildContext } from './utils/context';
import { normalizePath } from './utils/fs';

const testRootDir = join(__dirname, '..', 'test');

test('build', async () => {
  const ctx = createBuildContext(testRootDir);

  assert.is(normalizePath(testRootDir), ctx.rootDir);
  assert.is(normalizePath(join(testRootDir, 'src', 'routes')), ctx.opts.routesDir);

  await build(ctx);

  assert.equal(ctx.diagnostics, []);

  const routes = ctx.routes;

  const apiUser = routes.find((r) => r.pathname === '/api/[org]/[user].json')!;
  assert.equal(apiUser.id, 'QCEndpointApiOrgUserjsonIndex');
  assert.equal(apiUser.type, 'endpoint');
  assert.equal(apiUser.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json$/);
  assert.equal(apiUser.paramNames.length, 2);
  assert.equal(apiUser.paramNames[0], 'org');
  assert.equal(apiUser.paramNames[1], 'user');

  const apiData = routes.find((r) => r.pathname === '/api/data.json')!;
  assert.equal(apiData.id, 'QCEndpointApiDatajson');
  assert.equal(apiData.type, 'endpoint');
  assert.equal(apiData.pattern, /^\/api\/data\.json$/);
  assert.equal(apiData.paramNames.length, 0);

  const dashboardProfile = routes.find((r) => r.pathname === '/dashboard/profile')!;
  assert.equal(dashboardProfile.id, 'QCPageDashboardProfileIndex');
  assert.equal(dashboardProfile.type, 'page');
  assert.equal(dashboardProfile.pattern, /^\/dashboard\/profile\/?$/);
  assert.equal(dashboardProfile.paramNames.length, 0);
  assert.equal(dashboardProfile.paramNames.length, 0);

  const dashboardSettings = routes.find((r) => r.pathname === '/dashboard/settings')!;
  assert.equal(dashboardSettings.id, 'QCPageDashboardSettingsIndex');
  assert.equal(dashboardSettings.type, 'page');
  assert.equal(dashboardSettings.pattern, /^\/dashboard\/settings\/?$/);
  assert.equal(dashboardSettings.paramNames.length, 0);
  assert.equal(dashboardSettings.paramNames.length, 0);

  const docsCategory = routes.find((r) => r.pathname === '/docs/[category]/[id]')!;
  assert.equal(docsCategory.id, 'QCPageDocsCategoryIdIndex');
  assert.equal(docsCategory.type, 'page');
  assert.equal(docsCategory.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(docsCategory.paramNames.length, 2);
  assert.equal(docsCategory.paramNames[0], 'category');
  assert.equal(docsCategory.paramNames[1], 'id');

  const docsIntro = routes.find((r) => r.pathname === '/docs/introduction')!;
  assert.equal(docsIntro.id, 'QCPageDocsIntroductionIndex');
  assert.equal(docsIntro.type, 'page');
  assert.equal(docsIntro.pattern, /^\/docs\/introduction\/?$/);
  assert.equal(docsIntro.paramNames.length, 0);

  const aboutUs = routes.find((r) => r.pathname === '/about-us')!;
  assert.equal(aboutUs.id, 'QCPageAboutus');
  assert.equal(aboutUs.type, 'page');
  assert.equal(aboutUs.pattern, /^\/about-us\/?$/);
  assert.equal(aboutUs.paramNames.length, 0);

  const index = routes.find((r) => r.pathname === '/')!;
  assert.equal(index.id, 'QCPageIndex');
  assert.equal(index.type, 'page');
  assert.equal(index.pattern, /^\/$/);
  assert.equal(index.paramNames.length, 0);
  assert.equal(index.paramNames.length, 0);

  const layouts = ctx.layouts;
  assert.is(layouts.length, 4);

  const blogLayout = layouts.find((r) => r.id === 'QCLayoutBlog')!;
  assert.ok(blogLayout);

  const dashboardLayout = layouts.find((r) => r.id === 'QCLayoutDashboard')!;
  assert.ok(dashboardLayout);

  const docsLayout = layouts.find((r) => r.id === 'QCLayoutDocs')!;
  assert.ok(docsLayout);

  const rootLayout = layouts.find((r) => r.id === 'QCLayout')!;
  assert.ok(rootLayout);

  const menus = ctx.menus;
  assert.is(menus.length, 1);

  const docsMenu = menus.find((r) => r.id === 'QCMenuDocs')!;
  assert.ok(docsMenu);
  assert.is(docsMenu.pathname, '/docs');
  assert.is(docsMenu.text, 'Docs');
  assert.is(docsMenu.items?.length, 2);
});
