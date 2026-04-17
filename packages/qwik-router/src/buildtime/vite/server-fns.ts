import type { Rollup } from 'vite';
import type { RoutingContext } from '../types';

type ServerFnModuleInfo = Pick<
  Rollup.ModuleInfo,
  'code' | 'dynamicallyImportedIds' | 'id' | 'importedIds'
>;

export async function collectServerFnModuleIds(
  ctx: Pick<RoutingContext, 'layouts' | 'routes' | 'serverPlugins'>,
  resolvedVirtualId: string,
  loadModule: (id: string) => Promise<ServerFnModuleInfo>
) {
  const serverFnModules = new Set<string>();
  const queuedModuleIds = new Set<string>();
  const seenModuleIds = new Set<string>();
  const routes = ctx.routes;
  const layouts = ctx.layouts;
  const serverPlugins = ctx.serverPlugins;

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    queuedModuleIds.add(route.filePath);
    for (let j = 0; j < route.layouts.length; j++) {
      const layout = route.layouts[j];
      queuedModuleIds.add(layout.filePath);
    }
  }
  for (let i = 0; i < layouts.length; i++) {
    queuedModuleIds.add(layouts[i].filePath);
  }
  for (let i = 0; i < serverPlugins.length; i++) {
    queuedModuleIds.add(serverPlugins[i].filePath);
  }

  while (queuedModuleIds.size > 0) {
    const [id] = queuedModuleIds;
    queuedModuleIds.delete(id);

    if (seenModuleIds.has(id) || id === resolvedVirtualId) {
      continue;
    }
    seenModuleIds.add(id);

    const moduleInfo = await loadModule(id);
    if (moduleInfo.code?.includes('serverQrl(')) {
      serverFnModules.add(moduleInfo.id);
    }

    const resolvedImports = moduleInfo.importedIds.concat(moduleInfo.dynamicallyImportedIds);
    for (let i = 0; i < resolvedImports.length; i++) {
      const resolvedImport = resolvedImports[i];
      if (!resolvedImport && !seenModuleIds.has(resolvedImport)) {
        queuedModuleIds.add(resolvedImport);
      }
    }
  }

  return [...serverFnModules];
}
