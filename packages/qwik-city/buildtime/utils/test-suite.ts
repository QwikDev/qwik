/* eslint-disable */
import * as assert from 'uvu/assert';
import { join } from 'path';
import { suite as uvuSuite } from 'uvu';
import type {
  BuildContext,
  BuildLayout,
  BuildRoute,
  MarkdownAttributes,
  NormalizedPluginOptions,
} from '../types';
import { createBuildContext } from './context';
import { tmpdir } from 'os';
import { normalizePath } from './fs';
import { build } from '../build';

export function suite(title?: string) {
  const s = uvuSuite<TestContext>(title);
  const rootDir = tmpdir();

  s.before.each((testCtx) => {
    testCtx.ctx = createBuildContext(rootDir, {
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

export function testAppSuite(title: string) {
  const s = uvuSuite<TestAppBuildContext>(title);
  let buildCtx: any = null;

  s.before.each(async (testCtx) => {
    if (!buildCtx) {
      const testAppRootDir = join(__dirname, '..', '..', 'runtime', 'src');
      const ctx = createBuildContext(testAppRootDir, {
        routesDir: join(testAppRootDir, 'app', 'routes'),
      });

      assert.is(normalizePath(testAppRootDir), ctx.rootDir);
      assert.is(normalizePath(join(testAppRootDir, 'app', 'routes')), ctx.opts.routesDir);

      await build(ctx);

      assert.equal(ctx.diagnostics, []);

      buildCtx = ctx;
      Object.assign(testCtx, ctx);

      testCtx.assertPage = (p) => {
        const pageRoutes = ctx.routes.filter((r) => r.type === 'page');
        const r = pageRoutes.find((r) => r.pathname === p);
        if (!r) {
          console.log(pageRoutes);
          assert.ok(r, `did not find page route "${p}"`);
        }
        return r as any;
      };

      testCtx.assertEndpoint = (p) => {
        const endPointRoutes = ctx.routes.filter((r) => r.type === 'endpoint');
        const r = endPointRoutes.find((r) => r.pathname === p);
        if (!r) {
          console.log(endPointRoutes);
          assert.ok(r, `did not find endpoint route "${p}"`);
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
  assertPage: (pathname: string) => BuildRoute;
  assertEndpoint: (pathname: string) => BuildRoute;
  assertLayout: (id: string) => BuildLayout;
}

export interface TestContext {
  rootDir: string;
  ctx: BuildContext;
  opts: NormalizedPluginOptions;
  filePath: string;
  attrs: MarkdownAttributes;
}
