import type {
  ArrowFunctionExpression,
  CallExpression,
  Function as FunctionNode,
  JSXElement,
  JSXFragment,
  Node,
  Program,
  Statement,
} from 'oxc-parser';
import { isNode, type WalkableNode } from './ast-types';
import { identifierName, isFunctionLike, unwrapExpression } from './utils';
import type { BindingGraph } from './bindings';
import type { LocalId } from '../../schema';
import { QwikMarker } from '../../words';
import { UnsupportedError } from '../../errors';

export interface ComponentCandidate {
  statement: Statement;
  fn: Node;
  name: string | null;
}

/** Explicit markers and JSX-returning functions share component discovery. */
export function findComponentCandidates(
  program: Pick<Program, 'body'>,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string>
): ComponentCandidate[] {
  const markerCall = (value: Node): CallExpression | null => {
    if (value.type !== 'CallExpression') {
      return null;
    }
    const binding = bindings.reference(value.callee);
    return binding !== null && coreBindings.get(binding) === QwikMarker.Component ? value : null;
  };
  const declared: {
    value: Node;
    call: CallExpression | null;
    name: string | null;
    statement: Statement;
  }[] = [];
  const declare = (value: Node, name: string | null, statement: Statement) =>
    declared.push({ value, call: markerCall(unwrapExpression(value) ?? value), name, statement });
  forEachModuleDeclaration(program, (declaration, statement) => {
    if (declaration.type !== 'VariableDeclaration') {
      declare(
        declaration,
        isFunctionLike(declaration) ? identifierName(declaration.id) : null,
        statement
      );
      return;
    }
    for (const declarator of declaration.declarations) {
      if (declarator.init !== null) {
        declare(declarator.init, identifierName(declarator.id), statement);
      }
    }
  });
  // `component$(Body)` marks the module-level `Body`; the runtime call itself is an identity.
  const marked = new Set<string>();
  for (const { call } of declared) {
    if (call === null) {
      continue;
    }
    const argument = call.arguments[0];
    if (
      argument === undefined ||
      call.arguments.length !== 1 ||
      argument.type === 'SpreadElement'
    ) {
      throw new UnsupportedError('component$ without exactly one argument');
    }
    const reference = unwrapExpression(argument);
    if (reference?.type === 'Identifier') {
      marked.add(reference.name);
    }
  }
  const candidates: ComponentCandidate[] = [];
  for (const { value, call, name, statement } of declared) {
    const fn = unwrapExpression(call === null ? value : call.arguments[0]);
    const isMarked = call !== null || (name !== null && marked.has(name));
    // Only the marker makes a component; a function that merely returns JSX is a helper.
    if (fn !== null && isFunctionLike(fn) && isMarked) {
      candidates.push({ statement, fn, name });
    }
  }
  return candidates;
}

/** Visits each top-level declaration, looking through `export`. */
export function forEachModuleDeclaration(
  program: Pick<Program, 'body'>,
  visit: (declaration: Node, statement: Statement) => void
): void {
  for (const statement of program.body) {
    if (
      (statement.type === 'ExportNamedDeclaration' ||
        statement.type === 'ExportDefaultDeclaration') &&
      isNode(statement.declaration)
    ) {
      visit(statement.declaration, statement);
    } else {
      visit(statement, statement);
    }
  }
}

export interface HookCandidate {
  fn: ArrowFunctionExpression | FunctionNode;
  name: string;
  binding: LocalId;
}

/** Module-level `use*` functions: custom hooks by convention. */
export function findHookCandidates(
  program: Pick<Program, 'body'>,
  bindings: BindingGraph
): HookCandidate[] {
  const hooks: HookCandidate[] = [];
  const add = (fn: Node | null, id: Node | null): void => {
    const name = id === null ? null : identifierName(id);
    const binding = id === null ? null : bindings.declaration(id);
    if (
      fn !== null &&
      isFunctionLike(fn) &&
      name !== null &&
      binding !== null &&
      /^use[A-Z]/.test(name)
    ) {
      hooks.push({ fn, name, binding });
    }
  };
  forEachModuleDeclaration(program, (declaration) => {
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        add(declarator.init === null ? null : unwrapExpression(declarator.init), declarator.id);
      }
    } else if (declaration.type === 'FunctionDeclaration') {
      add(declaration, declaration.id);
    }
  });
  return hooks;
}

/**
 * JSX left in a candidate-less module must fail loud: it would otherwise reach the generic oxc
 * fallback, which compiles JSX against `react/jsx-runtime` — never acceptable output.
 */
export function findRuntimeJsx(node: unknown): JSXElement | JSXFragment | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRuntimeJsx(child);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (!isNode(node)) {
    return null;
  }
  if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
    return node;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    const found = findRuntimeJsx((node as WalkableNode)[key]);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

const RUNTIME_JSX_FACTORIES = new Set(['jsx', 'jsxs', 'jsxDEV']);

/** A runtime `jsx()` call builds a tree the compiler never sees — never compilable, so fail loud. */
export function findRuntimeJsxCall(
  node: unknown,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string>
): CallExpression | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findRuntimeJsxCall(child, bindings, coreBindings);
      if (found !== null) {
        return found;
      }
    }
    return null;
  }
  if (!isNode(node)) {
    return null;
  }
  if (node.type === 'CallExpression') {
    const binding = bindings.reference(node.callee);
    const imported = binding === null ? undefined : coreBindings.get(binding);
    if (imported !== undefined && RUNTIME_JSX_FACTORIES.has(imported)) {
      return node;
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    const found = findRuntimeJsxCall((node as WalkableNode)[key], bindings, coreBindings);
    if (found !== null) {
      return found;
    }
  }
  return null;
}

/** Returns of nested functions are not the outer function's returns. */
