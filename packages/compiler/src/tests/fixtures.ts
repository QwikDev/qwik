import {
  LINKED_PLAN_VERSION,
  BuildMode,
  Environment,
  PlanFormat,
  type LinkedPlan,
  type Specialization,
} from '../schema';
import type { Program } from 'oxc-parser';
import { compileFunction, runInNewContext } from 'node:vm';
import { parseModule } from '../analyse/ast/parse';
import { createBindingGraph } from '../analyse/ast/bindings';
import { createLowerContext } from '../analyse/lower-context';
import { emptyPlan } from '../analyse/plan';
import { createDocument } from '../../../qwik/src/testing/document';

export { emptyPlan as emptyModulePlan };

/** Setup-only renders never await the SSR lane. */
export const setupOnlyContext = { scheduler: { flush() {} }, optionalContextScopeRef: () => null };

export function readRenderedText(html: string, selector: string): (string | null)[] {
  const document = createDocument({ html });
  return Array.from(document.querySelectorAll(selector), (element) => element.textContent);
}

interface OutputModule {
  path: string;
  code: string;
  segment?: { ctxName: string } | null;
}

/** The chunks of `$` boundaries, without the component segments every module has. */
export function qrlChunks<T extends OutputModule>(output: { modules: readonly T[] }): T[] {
  return output.modules.filter(
    (module) => !!module.segment && module.segment.ctxName !== 'component$'
  );
}

/** The main module and its component segments: everything a module renders with. */
export function renderCode(output: { modules: readonly OutputModule[] }): string {
  return output.modules
    .filter((module) => !module.segment || module.segment.ctxName === 'component$')
    .map((module) => module.code)
    .join('\n');
}

/** The main module's default export, with the component segments it imports loaded beside it. */
export function loadDefaultFunction(
  output: OutputModule | readonly OutputModule[],
  globals: Record<string, unknown>,
  /** Serialized objects must share the runtime's prototypes. */
  useCurrentRealm = false
) {
  const modules: readonly OutputModule[] = Array.isArray(output) ? output : [output];
  const main = modules.find((module) => !module.segment) ?? modules[0];
  const components = modules.filter(
    (module) => module !== main && module.segment?.ctxName === 'component$'
  );
  const componentSpecifiers = new Set(
    components.map((module) => `./${module.path.slice(module.path.lastIndexOf('/') + 1, -3)}`)
  );
  // Import aliases of component segments, shared by every module in the one script.
  const aliases = new Map<string, string>();
  const scriptOf = (module: OutputModule, isMain: boolean) =>
    parseModule(module.path, module.code)
      .program.body.map((statement) => {
        if (statement.type === 'ImportDeclaration') {
          if (componentSpecifiers.has(statement.source.value)) {
            for (const specifier of statement.specifiers) {
              const imported =
                specifier.type === 'ImportSpecifier' ? specifier.imported : specifier.local;
              const importedName = imported.type === 'Identifier' ? imported.name : imported.value;
              if (importedName !== specifier.local.name) {
                aliases.set(specifier.local.name, importedName);
              }
            }
          }
          return '';
        }
        if (statement.type === 'ExportDefaultDeclaration') {
          const declaration = statement.declaration;
          if (declaration.type === 'FunctionDeclaration' && declaration.id !== null) {
            return `${module.code.slice(declaration.start, declaration.end)}\n${useCurrentRealm ? 'return ' : ''}${declaration.id.name};`;
          }
          return `${useCurrentRealm ? 'return ' : ''}(${module.code.slice(statement.declaration.start, statement.declaration.end)})`;
        }
        if (statement.type === 'ExportNamedDeclaration') {
          if (statement.declaration !== null) {
            return module.code.slice(statement.declaration.start, statement.declaration.end);
          }
          const defaultExport = statement.specifiers.find(
            (specifier) =>
              specifier.exported.type === 'Identifier' && specifier.exported.name === 'default'
          );
          return isMain && defaultExport !== undefined && defaultExport.local.type === 'Identifier'
            ? `${useCurrentRealm ? 'return ' : ''}${defaultExport.local.name};`
            : '';
        }
        return module.code.slice(statement.start, statement.end);
      })
      .join('\n');
  const componentScripts = components.map((module) => scriptOf(module, false));
  const mainScript = scriptOf(main, true);
  const script = [
    ...[...aliases].map(([local, imported]) => `const ${local} = ${imported};`),
    ...componentScripts,
    mainScript,
  ].join('\n');
  // Every component carries its serialization marker; stubs only when the globals lack the words.
  const sandbox = globals;
  if (!('_markComponent' in sandbox)) {
    Object.assign(sandbox, { _markComponent: (fn: unknown) => fn, _EMPTY_OBJ: {} });
  }
  if (!('_noopQrl' in sandbox)) {
    Object.assign(sandbox, { _noopQrl: (symbol: string) => ({ symbol }) });
  }
  // A block scopes the hoisted declarations, so a reused sandbox can evaluate more than once.
  return useCurrentRealm
    ? compileFunction(`{\n${script}\n}`, [], { contextExtensions: [sandbox] })()
    : runInNewContext(`{\n${script}\n}`, sandbox);
}

export function loadChunkFunction(
  module: { path: string; code: string },
  captures: unknown[] = [],
  globals: Record<string, unknown> = {}
) {
  const declaration = parseModule(module.path, module.code).program.body.find(
    (statement) => statement.type === 'ExportNamedDeclaration'
  )?.declaration;
  // A component segment exports a function declaration; every other chunk a const.
  const expression =
    declaration?.type === 'FunctionDeclaration'
      ? declaration
      : declaration?.type === 'VariableDeclaration'
        ? declaration.declarations[0].init!
        : null;
  if (expression === null) {
    throw new Error('expected an exported function');
  }
  return runInNewContext(`'use strict'; (${module.code.slice(expression.start, expression.end)})`, {
    ...globals,
    _capturesObj: { _: captures },
  });
}

export function createTestLowerContext(program: Program, source: string, path = 't.tsx') {
  const plan = emptyPlan(path, source);
  const bindings = createBindingGraph(program);
  plan.bindings = bindings.bindings;
  return { bindings, ctx: createLowerContext(plan, path, {}, bindings) };
}

export function serverSpecialization(): Specialization {
  return {
    environment: Environment.Server,
    mode: BuildMode.Prod,
    strip: { exports: [], ctxName: [], regCtxName: [] },
  };
}

export function emptyLinkedPlan(specialization: Specialization): LinkedPlan {
  return {
    format: PlanFormat.LinkedPlan,
    version: LINKED_PLAN_VERSION,
    specialization,
    complete: true,
    entries: [],
    modules: [],
    implementations: [],
    diagnostics: [],
  };
}

export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}
