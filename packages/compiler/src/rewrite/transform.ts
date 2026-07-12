import type { TransformModule } from '@qwik.dev/optimizer';
import type { Program } from 'oxc-parser';
import { createNamedImport, normalizeImports } from '../imports';
import { getRange } from '../ast-utils';
import { createModule } from '../module-utils';
import { createImportRecord } from '../stages/discover';
import { emitImports } from '../stages/emit-utils';
import type { CompilerContext, ImportRecord } from '../types';
import { discoverRewriteComponents } from './discover';
import { emitCsrBranchRender, emitCsrModule } from './emit-csr';
import { emitSegmentModules } from './emit-segment';
import { emitSsrBranchRender, emitSsrModule } from './emit-ssr';
import { extractQrls } from './extract';
import { lowerRewriteComponent } from './lower';
import type { ModuleDeclaration, RewriteModule, RewriteOutput, Segment } from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

export function tryTransformJsx(ctx: CompilerContext): TransformModule[] | null {
  if (ctx.program === null) {
    return null;
  }
  const extractedQrls = extractQrls(ctx.program, ctx.input.path);
  const components = discoverRewriteComponents(ctx.program, extractedQrls.componentReferences);
  if (components.length === 0) {
    return null;
  }
  const outputs: RewriteOutput[] = [];
  for (const component of components) {
    const result = lowerRewriteComponent(component, extractedQrls);
    if (result === null) {
      return null;
    }
    outputs.push({ component, result });
  }
  const segments = outputs.flatMap((output) => output.result.segments);
  const componentReferences = new Set(extractedQrls.componentReferences);
  const componentOutputs = outputs.filter(
    (output) =>
      output.component.exportName !== 'default' &&
      output.component.localName !== null &&
      componentReferences.has(output.component.localName)
  );
  const componentOutputSet = new Set(componentOutputs);
  const mainOutputs = outputs.filter((output) => !componentOutputSet.has(output));
  const explicitExtensions = ctx.options.explicitExtensions === true;
  const componentModules = componentOutputs.map((output) => {
    const name = output.component.localName!;
    const path = `${ctx.input.path}_component_${name}.js`;
    const slash = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return {
      output,
      name,
      path,
      importPath: `./${path.slice(slash + 1, -3)}${explicitExtensions ? '.js' : ''}`,
    };
  });
  const componentImportPaths = new Map(
    componentModules.map((component) => [component.name, component.importPath])
  );
  const rootSegments = mainOutputs.flatMap((output) =>
    output.result.segments.filter((segment) => segment.parentId === null)
  );
  const emitted = emitRewriteModule(ctx, mainOutputs, rootSegments);
  if (emitted === null) {
    return null;
  }
  const moduleReferences = emitModuleReferences(
    ctx.input.code,
    segments,
    components,
    extractedQrls.moduleDeclarations
  );
  const imports = emitModuleImports(
    ctx.program,
    ctx.input.code,
    [moduleReferences, emitted.code].filter(Boolean).join('\n'),
    emitted.imports
  );
  const componentImports = emitComponentImports(mainOutputs, componentImportPaths);
  const importCode = [imports, ...emitted.localImports, ...componentImports]
    .filter(Boolean)
    .join('\n');
  const componentReExports = componentModules.flatMap((component) =>
    component.output.component.exported
      ? [`export { ${component.name} } from ${JSON.stringify(component.importPath)};`]
      : []
  );
  const code = [moduleReferences, ...componentReExports, emitted.code].filter(Boolean).join('\n');
  const main = createModule(ctx.input.path, importCode === '' ? code : `${importCode}\n\n${code}`);
  const localModules: TransformModule[] = [];
  for (const component of componentModules) {
    const componentSegments = component.output.result.segments.filter(
      (segment) => segment.parentId === null
    );
    const emitted = emitRewriteModule(ctx, [component.output], componentSegments);
    if (emitted === null) {
      return null;
    }
    const componentImports = emitComponentImports(
      [component.output],
      componentImportPaths,
      component.name
    );
    const imports = emitModuleImports(
      ctx.program,
      ctx.input.code,
      emitted.code,
      emitted.imports,
      true
    );
    const importCode = [imports, ...emitted.localImports, ...componentImports]
      .filter(Boolean)
      .join('\n');
    localModules.push(
      createModule(
        component.path,
        importCode === '' ? emitted.code : `${importCode}\n\n${emitted.code}`,
        null,
        { isEntry: true, origPath: ctx.input.path }
      )
    );
  }
  const segmentModules = emitSegmentModules(
    segments,
    ctx.input.code,
    ctx.input.path,
    explicitExtensions,
    componentImportPaths,
    ctx.emitTarget,
    ctx.emitTarget === 'ssr' ? emitSsrBranchRender : emitCsrBranchRender
  );
  return segmentModules === null ? null : [main, ...localModules, ...segmentModules];
}

function emitRewriteModule(
  ctx: CompilerContext,
  outputs: readonly RewriteOutput[],
  segments: readonly Segment[]
): RewriteModule | null {
  return ctx.emitTarget === 'ssr'
    ? emitSsrModule(
        outputs,
        segments,
        ctx.input.code,
        ctx.input.path,
        ctx.options.explicitExtensions === true
      )
    : emitCsrModule(
        outputs,
        segments,
        ctx.input.code,
        ctx.input.path,
        ctx.options.explicitExtensions === true
      );
}

function emitComponentImports(
  outputs: readonly RewriteOutput[],
  componentImportPaths: ReadonlyMap<string, string>,
  self: string | null = null
): string[] {
  const names = new Set(
    outputs.flatMap((output) =>
      output.result.html.flatMap((part) => (part.kind === 'component' ? [part.name] : []))
    )
  );
  return [...names].flatMap((name) => {
    const path = componentImportPaths.get(name);
    return path === undefined || name === self
      ? []
      : [`import { ${name} } from ${JSON.stringify(path)};`];
  });
}

function emitModuleReferences(
  source: string,
  segments: readonly Segment[],
  components: ReturnType<typeof discoverRewriteComponents>,
  declarations: readonly ModuleDeclaration[]
): string {
  const references = new Set(segments.flatMap((segment) => segment.moduleReferences));
  if (references.size === 0) {
    return '';
  }
  const componentNames = new Set(
    components.flatMap((component) => (component.localName === null ? [] : [component.localName]))
  );
  const alreadyExported = new Set(componentNames);
  const code = declarations
    .filter((declaration) => declaration.names.every((name) => !componentNames.has(name)))
    .map((declaration) => {
      if (declaration.exported) {
        for (const name of declaration.names) {
          alreadyExported.add(name);
        }
      }
      return source.slice(declaration.range[0], declaration.range[1]).trim();
    });
  const exports = [...references].filter((name) => !alreadyExported.has(name));
  return [...code, ...(exports.length > 0 ? [`export { ${exports.join(', ')} };`] : [])].join('\n');
}

function emitModuleImports(
  program: Program,
  source: string,
  emittedCode: string,
  qwikImports: readonly string[],
  filterUnused = false
) {
  const imports: ImportRecord[] = [];
  const rawImports: string[] = [];
  for (const statement of program.body) {
    if (statement.type === 'ImportDeclaration') {
      const record = createImportRecord(statement);
      if (record === null) {
        const range = getRange(statement);
        if (range !== null) {
          rawImports.push(source.slice(range[0], range[1]));
        }
      } else {
        const filtered = removeRewriteOnlyImports(record, emittedCode, filterUnused);
        if (filtered !== null) {
          imports.push(filtered);
        }
      }
    }
  }
  if (qwikImports.length > 0) {
    imports.push(createNamedImport(QWIK_IMPORT, qwikImports));
  }
  return [...rawImports, ...emitImports(normalizeImports(imports))].join('\n');
}

function removeRewriteOnlyImports(
  record: ImportRecord,
  emittedCode: string,
  filterUnused: boolean
): ImportRecord | null {
  if (
    (record.source !== QWIK_CORE_IMPORT && record.source !== QWIK_IMPORT) ||
    record.specifiers.length === 0
  ) {
    return record;
  }
  const specifiers = record.specifiers.filter((specifier) => {
    if (specifier.kind !== 'named' || specifier.typeOnly) {
      return true;
    }
    if (filterUnused && !containsIdentifier(emittedCode, specifier.localName)) {
      return false;
    }
    const rewriteOnly =
      specifier.importedName === QwikHooks.Component ||
      specifier.importedName === QwikHooks.Dollar ||
      specifier.importedName.endsWith('$');
    return !rewriteOnly || containsIdentifier(emittedCode, specifier.localName);
  });
  return specifiers.length === 0 ? null : { ...record, specifiers };
}

function containsIdentifier(code: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(code);
}
