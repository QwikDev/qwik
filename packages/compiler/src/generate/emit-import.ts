import {
  BindingScope,
  ExportKind,
  ExportTargetKind,
  type LinkedHook,
  type LinkedModule,
  type LinkedQrl,
  type LocalId,
  type Range,
} from '../schema';
import { QWIK_CORE_IMPORT } from '../words';
import { allocateGeneratedName } from '../names';
import { UnsupportedError } from '../errors';
import { moduleBasename } from './output';

/**
 * Every module binding a QRL reads is exposed, in-module component bodies included, so a route
 * module scan sees an unexported `routeLoader$` the way the Rust optimizer's `_auto_` exports did.
 */
export function planModuleBindingExports(
  module: LinkedModule,
  /** Component bindings chunks import from the component's own segment instead. */
  segmentBindings: ReadonlySet<LocalId>
) {
  const names = new Map<LocalId, string>();
  const reserved = module.exports.flatMap((entry) =>
    entry.e === ExportKind.Star ? [] : [entry.exported]
  );
  const additions: string[] = [];
  for (const qrl of module.qrls) {
    for (const binding of qrl.dependencies.bindings) {
      const source = module.bindings[binding];
      if (
        source.scope !== BindingScope.Module ||
        names.has(binding) ||
        segmentBindings.has(binding)
      ) {
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

/** One generated file: the bindings it declares or imports, and the bodies it prints. */
export interface FileScope {
  declared: readonly LocalId[];
  bodies: ReadonlySet<LinkedQrl | LinkedHook>;
}

/** The runtime import line; no name it binds may be declared beside it or shadowed in a body. */
export function coreImportLine(
  module: LinkedModule,
  specifiers: ReadonlySet<string>,
  file: FileScope
): string {
  for (const specifier of specifiers) {
    const [imported, local = imported] = specifier.split(' as ');
    const isDeclared = file.declared.some(
      (binding) =>
        module.bindings[binding].name === local && !isCoreImportOf(module, binding, imported)
    );
    const isShadowed = module.bindings.some(
      (binding) => binding.name === local && isLocalInBodies(module, binding, file.bodies)
    );
    if (isDeclared || isShadowed) {
      // shortcut: refused, not aliased; aliasing needs every helper site to read an allocated name.
      throw new UnsupportedError(
        `an authored binding named "${local}": it collides with a Qwik runtime helper; rename it`
      );
    }
  }
  return `import { ${[...specifiers].join(', ')} } from ${JSON.stringify(QWIK_CORE_IMPORT)};`;
}

/**
 * A local belongs to the innermost QRL or hook body around it; a plain function nested in that body
 * cannot be told apart from the body itself, so it counts too.
 */
function isLocalInBodies(
  module: LinkedModule,
  binding: LinkedModule['bindings'][number],
  bodies: ReadonlySet<LinkedQrl | LinkedHook>
): boolean {
  if (binding.scope === BindingScope.Import || binding.scope === BindingScope.Module) {
    return false;
  }
  const declared = binding.declarationRange;
  if (declared === null) {
    return true;
  }
  let owner: LinkedQrl | LinkedHook | null = null;
  let ownerSize = Infinity;
  const enclose = (body: LinkedQrl | LinkedHook, [start, end]: Range) => {
    if (start <= declared[0] && declared[1] <= end && end - start < ownerSize) {
      owner = body;
      ownerSize = end - start;
    }
  };
  for (const qrl of module.qrls) {
    enclose(qrl, qrl.origin.range);
  }
  for (const hook of module.hooks) {
    enclose(hook, hook.range);
  }
  return owner !== null && bodies.has(owner);
}

/** The authored import the request set merges into, or a type the build erases. */
function isCoreImportOf(module: LinkedModule, binding: LocalId, imported: string): boolean {
  const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
  if (source === undefined) {
    return false;
  }
  return (
    source.typeOnly ||
    (source.imported === imported && module.edges[source.edge].specifier === QWIK_CORE_IMPORT)
  );
}

export function namedSpecifier(imported: string, local: string): string {
  const name = /^[A-Za-z_$][\w$]*$/.test(imported) ? imported : JSON.stringify(imported);
  return imported === local ? local : `${name} as ${local}`;
}

/** Only imports replaced during assembly need their authored bindings restored. */
export function requestBindingImport(module: LinkedModule, binding: LocalId, imports: Set<string>) {
  const source = module.imports.find((entry) => entry.source.binding === binding)?.source;
  if (source === undefined || source.typeOnly || !isReplacedCoreImport(module, source.edge)) {
    return;
  }
  const name = module.bindings[binding].name;
  imports.add(namedSpecifier(source.imported, name));
}

export function replacedCoreImports(module: LinkedModule) {
  return module.edges.filter(
    (_edge, index) =>
      module.imports.some((entry) => entry.source.edge === index) &&
      isReplacedCoreImport(module, index)
  );
}

/** A named-only core import statement: assembly rewrites it with the requested names. */
function isReplacedCoreImport(module: LinkedModule, edge: number): boolean {
  return (
    module.edges[edge].specifier === QWIK_CORE_IMPORT &&
    module.imports.every(
      ({ source }) =>
        source.edge !== edge || (source.imported !== '*' && source.imported !== 'default')
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
