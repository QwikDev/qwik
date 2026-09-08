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

export function emitBindingImports(
  module: LinkedModule,
  bindings: readonly LocalId[],
  coreImports: Set<string>
): string[] {
  const selected = new Set(bindings);
  const lines: string[] = [];
  for (const [index, edge] of module.edges.entries()) {
    const sources = module.imports.filter(
      ({ source }) => source.edge === index && !source.typeOnly && selected.has(source.binding)
    );
    if (sources.length === 0) {
      continue;
    }
    const parts: string[] = [];
    const named: string[] = [];
    for (const { source } of sources) {
      const name = module.bindings[source.binding].name;
      if (source.imported === 'default') {
        parts.unshift(name);
      } else if (source.imported === '*') {
        parts.push(`* as ${name}`);
      } else {
        const imported = /^[A-Za-z_$][\w$]*$/.test(source.imported)
          ? source.imported
          : JSON.stringify(source.imported);
        named.push(source.imported === name ? name : `${imported} as ${name}`);
      }
    }
    if (edge.specifier === QWIK_CORE_IMPORT && edge.attributes.length === 0 && parts.length === 0) {
      named.forEach((name) => coreImports.add(name));
      continue;
    }
    if (named.length > 0) {
      parts.push(`{ ${named.join(', ')} }`);
    }
    const attributes =
      edge.attributes.length === 0
        ? ''
        : ` with { ${edge.attributes.map(({ key, value }) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(', ')} }`;
    lines.push(`import ${parts.join(', ')} from ${JSON.stringify(edge.specifier)}${attributes};`);
  }
  return lines;
}
