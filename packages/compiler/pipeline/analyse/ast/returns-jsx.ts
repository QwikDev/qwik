import type {
  ArrowFunctionExpression,
  Function as FunctionNode,
  JSXElement,
  JSXFragment,
  Node,
  Program,
  Statement,
} from 'oxc-parser';
import { isNode, type WalkableNode } from './ast-types';
import { identifierName, isFunctionLike, unwrapExpression } from './utils';
import type { JsxAnalysis } from './jsx-analysis';
import type { BindingGraph } from './bindings';
import type { LocalId } from '../../schema';
import { QwikMarker } from '../../words';
import { UnsupportedError } from '../../errors';

function hasComponentName(name: string | null): boolean {
  return name === null || /^[A-Z]/.test(name);
}

export interface ComponentCandidate {
  statement: Statement;
  fn: Node;
  name: string | null;
}

/** Explicit markers and JSX-returning functions share component discovery. */
export function findComponentCandidates(
  program: Pick<Program, 'body'>,
  jsx: JsxAnalysis,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string>
): ComponentCandidate[] {
  const functions: ComponentCandidate[] = [];
  const addCandidate = (value: Node, name: string | null, statement: Statement): void => {
    let fn = unwrapExpression(value);
    let isMarked = false;
    if (fn?.type === 'CallExpression') {
      const binding = bindings.reference(fn.callee);
      if (binding === null || coreBindings.get(binding) !== QwikMarker.Component) {
        return;
      }
      const argument = fn.arguments[0];
      if (fn.arguments.length !== 1 || argument.type === 'SpreadElement') {
        throw new UnsupportedError('component$ without exactly one inline function');
      }
      fn = unwrapExpression(argument);
      if (fn === null || !isFunctionLike(fn)) {
        throw new UnsupportedError('component$ without an inline function');
      }
      isMarked = true;
    }
    if (
      fn !== null &&
      isFunctionLike(fn) &&
      (isMarked || (hasComponentName(name) && returnPositionContainsJsx(fn, jsx)))
    ) {
      functions.push({ statement, fn, name });
    }
  };
  const fromDeclaration = (declaration: Node, statement: Statement): void => {
    if (declaration.type === 'VariableDeclaration') {
      for (const declarator of declaration.declarations) {
        if (declarator.init !== null) {
          addCandidate(declarator.init, identifierName(declarator.id), statement);
        }
      }
      return;
    }
    addCandidate(
      declaration,
      isFunctionLike(declaration) ? identifierName(declaration.id) : null,
      statement
    );
  };
  forEachModuleDeclaration(program, fromDeclaration);
  return functions;
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

function returnPositionContainsJsx(fn: Node, jsx: JsxAnalysis): boolean {
  const body = unwrapExpression((fn as WalkableNode).body);
  if (body?.type !== 'BlockStatement') {
    return body !== null && jsx.read(body).hasJsxValue;
  }
  let found = false;
  visitReturns(body, (argument) => {
    const value = unwrapExpression(argument);
    found ||= value !== null && jsx.read(value).hasJsxValue;
  });
  return found;
}

/** Returns of nested functions are not the outer function's returns. */
function visitReturns(node: unknown, visitor: (argument: unknown) => void, root = true): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      visitReturns(child, visitor, false);
    }
    return;
  }
  if (!isNode(node)) {
    return;
  }
  if (!root && isFunctionLike(node)) {
    return;
  }
  if (node.type === 'ReturnStatement') {
    visitor(node.argument);
    return;
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'range') {
      continue;
    }
    visitReturns((node as WalkableNode)[key], visitor, false);
  }
}
