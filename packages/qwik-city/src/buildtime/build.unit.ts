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

  const signIn = routes.find((r) => r.pathname === '/sign-in')!;
  assert.equal(signIn.id, 'AuthSignin');
  assert.equal(signIn.type, 'page');
  assert.equal(signIn.pattern, /^\/sign-in\/?$/);
  assert.equal(signIn.paramNames.length, 0);

  const apiUser = routes.find((r) => r.pathname === '/api/[org]/[user].json')!;
  assert.equal(apiUser.id, 'ApiOrgUserjsonIndex');
  assert.equal(apiUser.type, 'endpoint');
  assert.equal(apiUser.pattern, /^\/api\/([^/]+?)\/([^/]+?)\.json$/);
  assert.equal(apiUser.paramNames.length, 2);
  assert.equal(apiUser.paramNames[0], 'org');
  assert.equal(apiUser.paramNames[1], 'user');

  const apiData = routes.find((r) => r.pathname === '/api/data.json')!;
  assert.equal(apiData.id, 'ApiDatajson');
  assert.equal(apiData.type, 'endpoint');
  assert.equal(apiData.pattern, /^\/api\/data\.json$/);
  assert.equal(apiData.paramNames.length, 0);

  const dashboardProfile = routes.find((r) => r.pathname === '/dashboard/profile')!;
  assert.equal(dashboardProfile.id, 'DashboardProfileIndex');
  assert.equal(dashboardProfile.type, 'page');
  assert.equal(dashboardProfile.pattern, /^\/dashboard\/profile\/?$/);
  assert.equal(dashboardProfile.paramNames.length, 0);
  assert.equal(dashboardProfile.paramNames.length, 0);

  const dashboardSettings = routes.find((r) => r.pathname === '/dashboard/settings')!;
  assert.equal(dashboardSettings.id, 'DashboardSettingsIndex');
  assert.equal(dashboardSettings.type, 'page');
  assert.equal(dashboardSettings.pattern, /^\/dashboard\/settings\/?$/);
  assert.equal(dashboardSettings.paramNames.length, 0);
  assert.equal(dashboardSettings.paramNames.length, 0);

  const docsCategory = routes.find((r) => r.pathname === '/docs/[category]/[id]')!;
  assert.equal(docsCategory.id, 'DocsCategoryIdIndex');
  assert.equal(docsCategory.type, 'page');
  assert.equal(docsCategory.pattern, /^\/docs\/([^/]+?)\/([^/]+?)\/?$/);
  assert.equal(docsCategory.paramNames.length, 2);
  assert.equal(docsCategory.paramNames[0], 'category');
  assert.equal(docsCategory.paramNames[1], 'id');

  const docsIntro = routes.find((r) => r.pathname === '/docs/introduction')!;
  assert.equal(docsIntro.id, 'DocsIntroductionIndex');
  assert.equal(docsIntro.type, 'page');
  assert.equal(docsIntro.pattern, /^\/docs\/introduction\/?$/);
  assert.equal(docsIntro.paramNames.length, 0);

  const docsGettingStarted = routes.find((r) => r.pathname === '/docs/getting-started')!;
  assert.equal(docsGettingStarted.id, 'DocsGettingstarted');
  assert.equal(docsGettingStarted.type, 'page');
  assert.equal(docsGettingStarted.pattern, /^\/docs\/getting-started\/?$/);
  assert.equal(docsGettingStarted.paramNames.length, 0);

  const aboutUs = routes.find((r) => r.pathname === '/about-us')!;
  assert.equal(aboutUs.id, 'Aboutus');
  assert.equal(aboutUs.type, 'page');
  assert.equal(aboutUs.pattern, /^\/about-us\/?$/);
  assert.equal(aboutUs.paramNames.length, 0);

  const index = routes.find((r) => r.pathname === '/')!;
  assert.equal(index.id, 'Index');
  assert.equal(index.type, 'page');
  assert.equal(index.pattern, /^\/$/);
  assert.equal(index.paramNames.length, 0);
  assert.equal(index.paramNames.length, 0);

  const layouts = ctx.layouts;
  assert.is(layouts.length, 4);

  const blogLayout = layouts.find((r) => r.id === 'BlogLayoutnested')!;
  assert.ok(blogLayout, 'found blog layout');
  assert.is(blogLayout.type, 'nested');

  const dashboardLayout = layouts.find((r) => r.id === 'DashboardLayoutnested')!;
  assert.ok(dashboardLayout, 'found dashboard layout');
  assert.is(dashboardLayout.type, 'nested');

  const docsLayout = layouts.find((r) => r.id === 'DocsLayouttop')!;
  assert.ok(docsLayout, 'found docs layout');
  assert.is(docsLayout.type, 'top');

  const rootLayout = layouts.find((r) => r.id === 'Layoutnested')!;
  assert.ok(rootLayout, 'found top layout');
  assert.is(rootLayout.type, 'nested');

  const menus = ctx.menus;
  assert.is(menus.length, 1);

  const docsMenu = menus.find((r) => r.id === 'DocsMenu')!;
  assert.ok(docsMenu, 'found docs menu');
  assert.is(docsMenu.pathname, '/docs');
  assert.is(docsMenu.text, 'Docs');
  assert.is(docsMenu.items?.length, 2);
});
