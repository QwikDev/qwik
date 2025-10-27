import type { QwikVitePlugin } from '@qwik.dev/core/optimizer';
import type { RoutingContext } from '../types';
import { getImportPath } from './utils';

export function createServerPlugins(
  ctx: RoutingContext,
  _qwikPlugin: QwikVitePlugin,
  c: string[],
  esmImports: string[],
  isSSR: boolean
) {
  c.push(`\n/** Qwik Router ServerPlugins (${ctx.serverPlugins.length}) */`);
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
