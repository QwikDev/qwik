import { join } from 'path';
import { suite as uvuSuite } from 'uvu';
import type { BuildContext, NormalizedPluginOptions } from '../types';
import type { PageAttributes } from '../../runtime';
import { createBuildContext } from './context';
import { tmpdir } from 'os';

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

export interface TestContext {
  rootDir: string;
  ctx: BuildContext;
  opts: NormalizedPluginOptions;
  filePath: string;
  attrs: PageAttributes;
}
