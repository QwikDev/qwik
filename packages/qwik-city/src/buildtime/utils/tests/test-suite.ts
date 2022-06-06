import { join } from 'path';
import { suite as uvuSuite } from 'uvu';
import type { BuildContext, NormalizedPluginOptions } from '../../types';
import type { PageAttributes } from '../../../runtime';
import { createBuildContext } from '../context';
import { tmpdir } from 'os';

export function suite(title?: string) {
  const s = uvuSuite<TestContext>(title);
  const rootDir = tmpdir();

  s.before.each((testCtx) => {
    testCtx.ctx = createBuildContext(
      rootDir,
      {
        pagesDir: join(rootDir, 'pages'),
        trailingSlash: false,
        mdx: {},
      },
      (msg) => console.warn(msg)
    );
    testCtx.rootDir = testCtx.ctx.rootDir;
    testCtx.opts = testCtx.ctx.opts;
    testCtx.filePath = join(testCtx.ctx.opts.pagesDir, 'welcome.mdx');
    testCtx.attrs = { title: '', description: '' };
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
