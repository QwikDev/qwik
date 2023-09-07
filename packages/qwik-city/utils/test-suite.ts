/* eslint-disable */
import * as assert from 'uvu/assert';
import { join } from 'node:path';
import { suite as uvuSuite } from 'uvu';
import type {
  BuildContext,
  BuildLayout,
  BuildRoute,
  MarkdownAttributes,
  NormalizedPluginOptions,
  PluginOptions,
} from '../buildtime/types';
import { createBuildContext } from '../buildtime/context';
import { tmpdir } from 'node:os';
import { normalizePath } from './fs';
import { build } from '../buildtime/build';
import { fileURLToPath } from 'node:url';

export function suite(title?: string) {
  const s = uvuSuite<TestContext>(title);
  const rootDir = tmpdir();
  const basePath = '/';

  s.before.each((testCtx) => {
    testCtx.ctx = createBuildContext(rootDir, basePath, {
      routesDir: join(rootDir, 'src', 'routes'),
    });
    testCtx.opts = testCtx.ctx.opts;
    testCtx.filePath = join(testCtx.ctx.opts.routesDir, 'welcome.mdx');
    testCtx.attrs = { title: '', description: '' };
  });

  s.after.each((testCtx) => {
    testCtx.ctx.diagnostics.forEach((d) => console.error(d.message));
  });

  return s;
}

export function testAppSuite(title: string, userOpts?: PluginOptions) {
  const s = uvuSuite<TestAppBuildContext>(title);
  let buildCtx: any = null;

  s.before.each(async (testCtx) => {
    if (!buildCtx) {
      const __dirname = fileURLToPath(new URL('.', import.meta.url));
      const testAppRootDir = join(__dirname, '..', '..', '..', 'starters', 'apps', 'qwikcity-test');
      const basePath = '/';
      const ctx = createBuildContext(testAppRootDir, basePath, userOpts);

      assert.is(normalizePath(testAppRootDir), ctx.rootDir);
      assert.is(normalizePath(join(testAppRootDir, 'src', 'routes')), ctx.opts.routesDir);

      await build(ctx);

      assert.equal(ctx.diagnostics, []);

      buildCtx = ctx;
      Object.assign(testCtx, ctx);

      testCtx.assertRoute = (p) => {
        const r = ctx.routes.find((r) => r.pathname === p);
        if (!r) {
          console.log(ctx.routes);
          assert.ok(r, `did not find page route "${p}"`);
        }
        return r as any;
      };

      testCtx.assertLayout = (id) => {
        const l = ctx.layouts.find((r) => r.id === id);
        if (!l) {
          console.log(ctx.layouts);
          assert.ok(l, `did not find layout "${id}"`);
        }
        return l as any;
      };
    }
  });

  return s;
}

export interface TestAppBuildContext extends BuildContext {
  assertRoute: (pathname: string) => BuildRoute;
  assertLayout: (id: string) => BuildLayout;
}

export interface TestContext {
  rootDir: string;
  ctx: BuildContext;
  opts: NormalizedPluginOptions;
  filePath: string;
  attrs: MarkdownAttributes;
}
