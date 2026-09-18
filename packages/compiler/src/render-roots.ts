/**
 * Render roots of a spec file: the `render(X)` arguments and every declaration they reach, for the
 * resume harness.
 */
import { parseModule } from './analyse/ast/parse';

export interface ExtractedRenderRoot {
  argumentStart: number;
  argumentEnd: number;
  code: string;
  exportName: string;
  sourceIndex: number;
}

export function extractRenderRoots(path: string, code: string): ExtractedRenderRoot[] {
  const parsed = parseModule(path, code);
  if (parsed.errors.length > 0) {
    return [];
  }

  const imports = parsed.program.body
    .filter((statement) => statement.type === 'ImportDeclaration')
    .map((statement) => code.slice(statement.start, statement.end));
  const roots: Array<{
    argumentStart: number;
    argumentEnd: number;
    exportName: string;
    declarations: SourceDeclaration[];
    scope: SourceNode;
  }> = [];
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
    const rootDeclaration = declarations.get(rootName);
    if (rootDeclaration === undefined) {
      return;
    }
    roots.push({
      argumentStart: argument.start,
      argumentEnd: argument.end,
      exportName: rootName,
      declarations: collectReachableDeclarations(declarations, rootName),
      scope: rootDeclaration.scope,
    });
  });
  const sources = new Map<
    SourceNode,
    { index: number; declarations: Map<number, SourceDeclaration> }
  >();
  for (const root of roots) {
    let source = sources.get(root.scope);
    if (source === undefined) {
      source = { index: sources.size, declarations: new Map() };
      sources.set(root.scope, source);
    }
    for (const declaration of root.declarations) {
      source.declarations.set(declaration.node.start, declaration);
    }
  }
  return roots.map(({ argumentStart, argumentEnd, exportName, scope }) => {
    const source = sources.get(scope)!;
    return {
      argumentStart,
      argumentEnd,
      code: `${imports.join('\n')}\n${[...source.declarations.values()]
        .map((declaration) => declaration.source)
        .join('\n')}\n`,
      exportName,
      sourceIndex: source.index,
    };
  });
}

interface SourceNode {
  type: string;
  start: number;
  end: number;
  [key: string]: unknown;
}

interface SourceDeclaration {
  node: SourceNode;
  scope: SourceNode;
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
              scope,
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
            scope,
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

/** Pre-pass: collect `native$` declarations across all inputs into the target registry. */
