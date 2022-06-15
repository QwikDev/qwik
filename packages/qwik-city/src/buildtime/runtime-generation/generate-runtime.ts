import type { BuildContext } from '../types';
import { createBuildId, createQwikManifest } from './utils';
import { createMenus } from './menus';
import { createInlinedImportRoutes } from './routes';

export function generateDynamicImportedRuntime(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createInlinedImportRoutes(ctx, c, esmImports);

  createMenus(ctx, c);

  createQwikManifest(c);

  createBuildId(c);

  return esmImports.join('\n') + c.join('\n');
}

export function generateInlinedRuntime(ctx: BuildContext) {
  const esmImports: string[] = [];
  const c: string[] = [];

  createInlinedImportRoutes(ctx, c, esmImports);

  createMenus(ctx, c);

  createQwikManifest(c);

  createBuildId(c);

  return esmImports.join('\n') + c.join('\n');
}
