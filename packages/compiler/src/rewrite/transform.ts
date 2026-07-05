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
import { emitSsrModule } from './emit-ssr';
import { lowerRewriteComponent } from './lower';
import type { RewriteOutput } from './types';
import { QWIK_CORE_IMPORT, QWIK_IMPORT, QwikHooks } from './words';

export function tryTransformJsx(ctx: CompilerContext): TransformModule[] | null {
  if (ctx.program === null) {
    return null;
  }
  const components = discoverRewriteComponents(ctx.program);
  if (components.length === 0) {
    return null;
  }
  const outputs: RewriteOutput[] = [];
  for (const component of components) {
    const result = lowerRewriteComponent(component);
    if (result === null) {
      return null;
    }
    outputs.push({ component, result });
  }
  const emitted =
    ctx.emitTarget === 'ssr'
      ? emitSsrModule(outputs, ctx.input.code)
      : emitCsrModule(outputs, ctx.input.code);
  if (emitted === null) {
    return null;
  }
  const imports = emitModuleImports(ctx.program, ctx.input.code, emitted.code, emitted.imports);
  return [
    createModule(ctx.input.path, imports === '' ? emitted.code : `${imports}\n\n${emitted.code}`),
  ];
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
  if (record.source !== QWIK_CORE_IMPORT || record.specifiers.length === 0) {
    return record;
  }
  const specifiers = record.specifiers.filter(
    (specifier) =>
      specifier.kind !== 'named' ||
      specifier.typeOnly ||
      specifier.importedName !== QwikHooks.Component ||
      containsIdentifier(emittedCode, specifier.localName)
  );
  return specifiers.length === 0 ? null : { ...record, specifiers };
}

function containsIdentifier(code: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(code);
}
