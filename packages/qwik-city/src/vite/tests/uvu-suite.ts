import { join } from 'path';
import { suite as uvuSuite } from 'uvu';
import type { PluginContext } from '../types';
import type { PageAttributes } from '../../runtime';

export function suite(title?: string) {
  const s = uvuSuite<TestContext>(title);
  s.before.each((testCtx) => {
    testCtx.ctx = {
      opts: {
        pagesDir: join(__dirname, 'pages'),
        layouts: {
          full: join(__dirname, 'src', 'layouts', 'full.tsx'),
          default: join(__dirname, 'src', 'layouts', 'default.tsx'),
        },
      },
      extensions: ['.mdx', '.md'],
      pages: [],
      indexes: [],
    };
    testCtx.filePath = join(testCtx.ctx.opts.pagesDir, 'welcome.mdx');
    testCtx.attrs = { title: '', description: '' };
  });
  return s;
}

export interface TestContext {
  ctx: PluginContext;
  filePath: string;
  attrs: PageAttributes;
}
