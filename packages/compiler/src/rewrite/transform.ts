import type { TransformModule } from '@qwik.dev/optimizer';
import type { Program } from 'oxc-parser';
import { createNamedImport, normalizeImports } from '../imports';
import { getRange } from '../ast-utils';
import { createModule } from '../module-utils';
import { createImportRecord } from '../stages/discover';
import { emitImports } from '../stages/emit-utils';
import type { CompilerContext, ImportRecord } from '../types';
import { discoverRewriteComponents } from './discover';
import { emitCsrModule } from './emit-csr';
import { emitSegmentModules } from './emit-segment';
import { emitSsrModule } from './emit-ssr';
import { extractQrls } from './extract';
import { lowerRewriteComponent } from './lower';
import type { ModuleDeclaration, RewriteOutput, Segment } from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

export function tryTransformJsx(ctx: CompilerContext): TransformModule[] | null {
  if (ctx.program === null) {
    return null;
  }
  const components = discoverRewriteComponents(ctx.program);
  if (components.length === 0) {
    return null;
  }
  const extractedQrls = extractQrls(ctx.program, ctx.input.path);
  const outputs: RewriteOutput[] = [];
  for (const component of components) {
    const result = lowerRewriteComponent(component, extractedQrls);
    if (result === null) {
      return null;
    }
    outputs.push({ component, result });
  }
  const segments = outputs.flatMap((output) => output.result.segments);
  const rootSegments = segments.filter((segment) => segment.parentId === null);
  const emitted =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(
          outputs,
          rootSegments,
          ctx.input.code,
          ctx.input.path,
          ctx.options.explicitExtensions === true
        )
      : emitCsrModule(
          outputs,
          rootSegments,
          ctx.input.code,
          ctx.input.path,
          ctx.options.explicitExtensions === true
        );
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
  const importCode = [imports, ...emitted.localImports].filter(Boolean).join('\n');
  const code = [moduleReferences, emitted.code].filter(Boolean).join('\n');
  const main = createModule(ctx.input.path, importCode === '' ? code : `${importCode}\n\n${code}`);
  return [
    main,
    ...emitSegmentModules(
      segments,
      ctx.input.code,
      ctx.input.path,
      ctx.options.explicitExtensions === true,
      ctx.emitTarget
    ),
  ];
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
  qwikImports: readonly string[]
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
        const filtered = removeRewriteOnlyImports(record, emittedCode);
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

function removeRewriteOnlyImports(record: ImportRecord, emittedCode: string): ImportRecord | null {
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
