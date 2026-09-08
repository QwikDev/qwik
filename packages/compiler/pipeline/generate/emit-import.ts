import {
  BindingScope,
  ExportKind,
  ExportTargetKind,
  type LinkedModule,
  type LocalId,
} from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import { allocateGeneratedName } from '../names';
import { moduleBasename } from './output';

/** Only cross-chunk references require exposing an authored module binding. */
export function planModuleBindingExports(module: LinkedModule) {
  const names = new Map<LocalId, string>();
  const reserved = module.exports.flatMap((entry) =>
    entry.e === ExportKind.Star ? [] : [entry.exported]
  );
  const additions: string[] = [];
  for (const qrl of module.qrls) {
    if (qrl.declaration !== undefined) {
      continue;
    }
    for (const binding of qrl.dependencies.bindings) {
      const source = module.bindings[binding];
      if (source.scope !== BindingScope.Module || names.has(binding)) {
        continue;
      }
      // Default expressions may snapshot bindings instead of exposing live exports.
      const existing = module.exports.find(
        (entry) =>
          entry.e === ExportKind.Local &&
          entry.exported !== 'default' &&
          entry.target.t === ExportTargetKind.Binding &&
          entry.target.binding === binding
      );
      if (existing !== undefined && existing.e === ExportKind.Local) {
        names.set(binding, existing.exported);
        continue;
      }
      const name = allocateGeneratedName(`__qwik_${source.name}`, reserved);
      reserved.push(name);
      names.set(binding, name);
      additions.push(`${source.name} as ${name}`);
    }
  }
  return { names, code: additions.length === 0 ? '' : `\nexport { ${additions.join(', ')} };\n` };
}

function namedSpecifier(imported: string, local: string): string {
  const name = /^[A-Za-z_$][\w$]*$/.test(imported) ? imported : JSON.stringify(imported);
  return imported === local ? local : `${name} as ${local}`;
}

/** Only imports replaced during assembly need their authored bindings restored. */
export function requestBindingImport(module: LinkedModule, binding: LocalId, imports: Set<string>) {
  const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
  if (
    source === undefined ||
    !replacedCoreImports(module).includes(module.edges[source.edge]) ||
    source.typeOnly
  ) {
    return;
  }
  const name = module.bindings[binding].name;
  imports.add(namedSpecifier(source.imported, name));
}

export function replacedCoreImports(module: LinkedModule) {
  return module.edges.filter(
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
  coreImports: Set<string>,
  moduleExports: ReadonlyMap<LocalId, string>
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
        named.push(namedSpecifier(source.imported, name));
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
  const localImports: string[] = [];
  for (const binding of bindings) {
    const exported = moduleExports.get(binding);
    if (exported !== undefined) {
      localImports.push(namedSpecifier(exported, module.bindings[binding].name));
    }
  }
  if (localImports.length > 0) {
    lines.push(
      `import { ${localImports.join(', ')} } from ${JSON.stringify(`./${moduleBasename(module)}`)};`
    );
  }
  return lines;
}
