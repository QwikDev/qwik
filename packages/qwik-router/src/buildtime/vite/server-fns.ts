import type { Rollup } from 'vite';
import type { RoutingContext } from '../types';

export type ServerFnPluginContext = Pick<Rollup.PluginContext, 'resolve' | 'load'>;
export type ServerFnRoutingContext = Pick<RoutingContext, 'layouts' | 'routes' | 'serverPlugins'>;
export async function collectServerFnModuleIds(
  routingContext: ServerFnRoutingContext,
  resolvedVirtualId: string,
  pluginContext: ServerFnPluginContext
) {
  const serverFnModules = new Set<string>();
  const queuedModuleIds = new Set<string>();
  const seenModuleIds = new Set<string>();
  const routes = routingContext.routes;
  const layouts = routingContext.layouts;
  const serverPlugins = routingContext.serverPlugins;

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

    const resolved = await pluginContext.resolve(id, undefined, { skipSelf: true });
    if (!resolved || resolved.external) {
      continue;
    }

    const moduleInfo = await pluginContext.load({ id: resolved.id });
    if (moduleInfo.code == null) {
      continue;
    }

    if (moduleInfo.code.includes('serverQrl(')) {
      serverFnModules.add(moduleInfo.id);
    }

    const resolvedImports = moduleInfo.importedIds.concat(moduleInfo.dynamicallyImportedIds);
    for (let i = 0; i < resolvedImports.length; i++) {
      const resolvedImport = resolvedImports[i];
      if (resolvedImport && !seenModuleIds.has(resolvedImport)) {
        queuedModuleIds.add(resolvedImport);
      }
    }
  }

  return [...serverFnModules];
}
