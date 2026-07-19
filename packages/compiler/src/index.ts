import type {
  TransformModuleInput,
  TransformModulesOptions,
  TransformOutput,
} from '@qwik.dev/optimizer';
import { parseSync } from 'oxc-parser';
import { createModule, isJsxPath, isTypeScriptPath, transformWithOxc } from './module-utils';
import { mapDiagnosticsToOriginal, normalizeTransformInput } from './normalization';
import { parseModule } from './parse';
import type { CompilerContext, CompilerResult } from './types';
import { transformModule } from './transform';

/** @public */
export async function transformModules(options: TransformModulesOptions): Promise<TransformOutput> {
  const results = await Promise.all(options.input.map((input) => transformInput(input, options)));

  return {
    modules: results.flatMap((result) => result.modules),
    diagnostics: results.flatMap((result) => result.diagnostics),
    isTypeScript: options.input.some((input) => isTypeScriptPath(input.path)),
    isJsx: options.input.some((input) => isJsxPath(input.path)),
  };
}

/** @internal */
export interface ExtractedRenderRoot {
  argumentStart: number;
  argumentEnd: number;
  code: string;
  exportName: string;
}

/** @internal */
export function extractRenderRoots(path: string, code: string): ExtractedRenderRoot[] {
  const parsed = parseSync(path, code, {
    lang: path.endsWith('x') ? 'tsx' : 'ts',
    sourceType: 'module',
    astType: 'ts',
    range: true,
  });
  if (parsed.errors.length > 0) {
    return [];
  }

  const imports = parsed.program.body
    .filter((statement) => statement.type === 'ImportDeclaration')
    .map((statement) => code.slice(statement.start, statement.end));
  const roots: ExtractedRenderRoot[] = [];
  visitTestSource(parsed.program as unknown as SourceNode, [], (call, ancestors) => {
    if (!isRenderCall(call)) {
      return;
    }
    const argument = (call.arguments as SourceNode[])[0];
    if (argument?.type !== 'Identifier') {
      return;
    }
    const rootName = argument.name as string;
    const declarations = collectScopedDeclarations(ancestors, call.start, code);
    if (!declarations.has(rootName)) {
      return;
    }
    const reachable = collectReachableDeclarations(declarations, rootName);
    roots.push({
      argumentStart: argument.start,
      argumentEnd: argument.end,
      code: `${imports.join('\n')}\n${reachable.map((declaration) => declaration.source).join('\n')}\n`,
      exportName: rootName,
    });
  });
  return roots;
}

interface SourceNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface SourceDeclaration {
  node: SourceNode;
  source: string;
}

function visitTestSource(
  node: SourceNode,
  ancestors: readonly SourceNode[],
  visit: (node: SourceNode, ancestors: readonly SourceNode[]) => void
): void {
  visit(node, ancestors);
  const nextAncestors = [...ancestors, node];
  for (const [key, value] of Object.entries(node)) {
    if (SOURCE_NODE_KEYS.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isSourceNode(child)) {
          visitTestSource(child, nextAncestors, visit);
        }
      }
    } else if (isSourceNode(value)) {
      visitTestSource(value, nextAncestors, visit);
    }
  }
}

function isRenderCall(node: SourceNode): boolean {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const callee = node.callee as SourceNode | undefined;
  if (callee?.type === 'Identifier') {
    return callee.name === 'render' || callee.name === 'csrRender' || callee.name === 'ssrRender';
  }
  if (callee?.type !== 'MemberExpression' || callee.computed === true) {
    return false;
  }
  const property = callee.property as SourceNode | undefined;
  return property?.type === 'Identifier' && property.name === 'render';
}

function collectScopedDeclarations(
  ancestors: readonly SourceNode[],
  before: number,
  code: string
): Map<string, SourceDeclaration> {
  const declarations = new Map<string, SourceDeclaration>();
  for (const scope of ancestors) {
    if (scope.type !== 'Program' && scope.type !== 'BlockStatement') {
      continue;
    }
    const statements = scope.body as SourceNode[];
    for (const statement of statements) {
      if (statement.end > before) {
        continue;
      }
      if (statement.type === 'VariableDeclaration') {
        const kind = statement.kind as string;
        for (const declaration of statement.declarations as SourceNode[]) {
          const id = declaration.id as SourceNode;
          if (id.type === 'Identifier') {
            declarations.set(id.name as string, {
              node: declaration,
              source: `export ${kind} ${code.slice(declaration.start, declaration.end)};`,
            });
          }
        }
      } else if (
        statement.type === 'FunctionDeclaration' ||
        statement.type === 'ClassDeclaration'
      ) {
        const id = statement.id as SourceNode | null;
        if (id?.type === 'Identifier') {
          declarations.set(id.name as string, {
            node: statement,
            source: `export ${code.slice(statement.start, statement.end)}`,
          });
        }
      }
    }
  }
  return declarations;
}

function collectReachableDeclarations(
  declarations: ReadonlyMap<string, SourceDeclaration>,
  rootName: string
): SourceDeclaration[] {
  const reachable = new Set([rootName]);
  const queue = [rootName];
  for (let i = 0; i < queue.length; i++) {
    const declaration = declarations.get(queue[i]);
    if (declaration === undefined) {
      continue;
    }
    visitTestSource(declaration.node, [], (node) => {
      if (node.type !== 'Identifier' && node.type !== 'JSXIdentifier') {
        return;
      }
      const name = node.name as string;
      if (declarations.has(name) && !reachable.has(name)) {
        reachable.add(name);
        queue.push(name);
      }
    });
  }
  return [...declarations]
    .filter(([name]) => reachable.has(name))
    .map(([, declaration]) => declaration);
}

function isSourceNode(value: unknown): value is SourceNode {
  return (
    value !== null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'start' in value &&
    typeof value.start === 'number' &&
    'end' in value &&
    typeof value.end === 'number'
  );
}

const SOURCE_NODE_KEYS = new Set(['type', 'start', 'end', 'range', 'loc']);

async function transformInput(
  input: TransformModuleInput,
  options: TransformModulesOptions
): Promise<CompilerResult> {
  const normalizedInput = await normalizeTransformInput(input, options);
  const ctx: CompilerContext = {
    input: normalizedInput,
    options,
    emitTarget: options.isServer === false ? 'csr' : 'ssr',
    program: null,
    diagnostics: [],
  };

  parseModule(ctx);
  if (ctx.diagnostics.length === 0) {
    const result = transformModule(ctx);
    switch (result.kind) {
      case 'success':
        return {
          modules: result.modules,
          diagnostics: ctx.diagnostics,
        };
      case 'failure':
        return {
          modules: [createModule(input.path, '')],
          diagnostics: await mapDiagnosticsToOriginal(normalizedInput, options, [
            ...ctx.diagnostics,
            ...result.diagnostics,
          ]),
        };
      case 'not-applicable':
        break;
    }
  }

  if (ctx.diagnostics.length > 0) {
    return {
      modules: [createModule(input.path, '')],
      diagnostics: await mapDiagnosticsToOriginal(normalizedInput, options, ctx.diagnostics),
    };
  }

  const fallback = await transformWithOxc(input, options);
  return {
    modules: [fallback],
    diagnostics: ctx.diagnostics,
  };
}
