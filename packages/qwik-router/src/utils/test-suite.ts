/* eslint-disable no-empty-pattern */
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, beforeAll, test, type TestAPI } from 'vitest';
import { parseRoutesDir } from '../buildtime/build';
import { createBuildContext } from '../buildtime/context';
import type {
  RoutingContext,
  BuiltLayout,
  BuiltRoute,
  MarkdownAttributes,
  PluginOptions,
} from '../buildtime/types';
import { normalizePath } from './fs';

export { assert };

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function suite(title: string = 'qwik-router') {
  const rootDir = tmpdir();
  const basePath = '/';

  return test.extend<TestContext>({
    ctx: async ({}, use) => {
      const ctx = createBuildContext(rootDir, basePath, {
        routesDir: join(rootDir, 'src', 'routes'),
      });
      await use(ctx);
      ctx.diagnostics.forEach((d) => console.error(d.message));
    },
    filePath: ({ ctx }, use) => use(join(ctx.opts.routesDir, 'welcome.mdx')),
    attrs: ({}, use) => use({ title: '', description: '' }),
  });
}

export function testAppSuite(
  title: string,
  userOpts?: PluginOptions
): TestAPI<TestAppBuildContext> {
  let buildCtx: RoutingContext;

  beforeAll(async (testCtx) => {
    const testAppRootDir = join(
      __dirname,
      '..',
      '..',
      '..',
      '..',
      'starters',
      'apps',
      'qwikrouter-test'
    );
    const basePath = '/';
    const ctx = createBuildContext(testAppRootDir, basePath, userOpts);

    assert.equal(normalizePath(testAppRootDir), ctx.rootDir);
    assert.equal(normalizePath(join(testAppRootDir, 'src', 'routes')), ctx.opts.routesDir);

    await parseRoutesDir(ctx);

    assert.deepEqual(ctx.diagnostics, []);

    buildCtx = ctx;
    Object.assign(testCtx, ctx);
  });

  const assertRoute = (p: string) => {
    const r = buildCtx.routes.find((r) => r.pathname === p);
    if (!r) {
      // eslint-disable-next-line no-console
      console.log(buildCtx.routes);
      assert.ok(r, `did not find page route "${p}"`);
    }
    return r as any;
  };
  const assertLayout = (id: string) => {
    const l = buildCtx.layouts.find((r) => r.id === id);
    if (!l) {
      // eslint-disable-next-line no-console
      console.log(buildCtx.layouts);
      assert.ok(l, `did not find layout "${id}"`);
    }
    return l as any;
  };

  const myTest = test.extend<TestAppBuildContext>({
    ctx: async ({}, use) => use(buildCtx),
    filePath: ({ ctx }, use) => use(join(ctx.opts.routesDir, 'welcome.mdx')),
    attrs: ({}, use) => use({ title: '', description: '' }),

    assertRoute: ({}, use) => use(assertRoute),
    assertLayout: ({}, use) => use(assertLayout),
  });

  return myTest;
}

export interface TestAppBuildContext extends TestContext {
  assertRoute: (pathname: string) => BuiltRoute;
  assertLayout: (id: string) => BuiltLayout;
}

export interface TestContext {
  ctx: RoutingContext;
  filePath: string;
  attrs: MarkdownAttributes;
}
