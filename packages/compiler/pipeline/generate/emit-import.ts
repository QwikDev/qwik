import type { LinkedModule, LocalId } from '../schema';
import { QWIK_CORE_IMPORT } from '../words';

/** Only imports replaced during assembly need their authored bindings restored. */
export function requestBindingImport(module: LinkedModule, binding: LocalId, imports: Set<string>) {
  const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
  if (
    source === undefined ||
    module.edges[source.edge] !== replacedCoreImport(module) ||
    source.typeOnly
  ) {
    return;
  }
  const name = module.bindings[binding].name;
  imports.add(source.imported === name ? name : `${source.imported} as ${name}`);
}

export function replacedCoreImport(module: LinkedModule) {
  return module.edges.find(
    (edge, index) =>
      edge.specifier === QWIK_CORE_IMPORT &&
      module.imports.some((entry) => entry.source.edge === index) &&
      module.imports.every(
        ({ source }) =>
          source.edge !== index || (source.imported !== '*' && source.imported !== 'default')
      )
  );
}
