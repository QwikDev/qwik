import type { QwikVitePlugin } from '@builder.io/qwik/optimizer';
import type { BuildContext } from '../types';
import { getImportPath } from './utils';

export function createServerPlugins(
  ctx: BuildContext,
  _qwikPlugin: QwikVitePlugin,
  c: string[],
  esmImports: string[],
  isSSR: boolean
) {
  c.push(`\n/** Qwik City ServerPlugins (${ctx.serverPlugins.length}) */`);
  c.push(`export const serverPlugins = [`);
  if (isSSR) {
    for (const file of ctx.serverPlugins) {
      const importPath = JSON.stringify(getImportPath(file.filePath));
      esmImports.push(`import * as ${file.id} from ${importPath};`);
    }
    for (const file of ctx.serverPlugins) {
      c.push(`  ${file.id},`);
    }
  }
  c.push(`];`);
}
