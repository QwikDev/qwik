import type { BuildContext } from '../types';
import { createMenus } from './menus';
import { createInlinedImportRoutes } from './routes';

export function generateInlinedRuntime(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createInlinedImportRoutes(ctx, c, esmImports);

  createMenus(ctx, c);

  return esmImports.join('\n') + c.join('\n');
}
