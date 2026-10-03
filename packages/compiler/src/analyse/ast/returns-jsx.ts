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
import type { JsxAnalysis } from './jsx-analysis';
import type { BindingGraph } from './bindings';
import { BindingScope, VarKind, type LocalId } from '../../schema';
import { QwikMarker } from '../../words';
import { UnsupportedError } from '../../errors';

function hasComponentName(name: string | null): boolean {
  return name === null || /^[A-Z]/.test(name);
}

export interface ComponentCandidate {
  statement: Statement;
  fn: Node;
  name: string | null;
  /** `component$(X)`: the `X` the function was read through. */
  reference?: Node;
}

/** Explicit markers and JSX-returning functions share component discovery. */
export function findComponentCandidates(
  program: Pick<Program, 'body'>,
  jsx: JsxAnalysis,
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
  const candidates: ComponentCandidate[] = [];
  for (const { value, call, name, statement } of declared) {
    if (call === null) {
      const fn = unwrapExpression(value);
      if (fn !== null && isHeuristicComponent(fn, name, jsx)) {
        candidates.push({ statement, fn, name });
      }
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
    const inline = unwrapExpression(argument);
    if (inline === null) {
      continue;
    }
    // An import cannot be compiled here: the link checks it and the call stays an identity.
    if (isFunctionLike(inline)) {
      candidates.push({ statement, fn: inline, name });
      continue;
    }
    const fn = referencedComponentFunction(inline, bindings);
    if (fn !== null) {
      candidates.push({ statement, fn, name, reference: inline });
    }
  }
  return candidates;
}

function isHeuristicComponent(fn: Node, name: string | null, jsx: JsxAnalysis): boolean {
  return (
    isFunctionLike(fn) &&
    hasComponentName(name) &&
    returnPositionContainsJsx(fn, jsx, name === null)
  );
}

/** `component$(X)` compiles the function `X` names as if it were written inline. */
export function referencedComponentFunction(
  reference: Node,
  bindings: BindingGraph
): ArrowFunctionExpression | FunctionNode | null {
  const binding = reference.type === 'Identifier' ? bindings.reference(reference) : null;
  if (binding === null) {
    return null;
  }
  const { name, scope, varKind } = bindings.bindings[binding];
  const declarations = bindings.declarationsOf(binding);
  const declaration = declarations.length === 1 ? declarations[0] : null;
  if (declaration?.type === 'FunctionDeclaration') {
    if (scope !== BindingScope.Module) {
      throw new UnsupportedError(`component$ of the local function declaration "${name}"`);
    }
    return declaration;
  }
  const fn = declaration?.type === 'VariableDeclarator' ? unwrapExpression(declaration.init) : null;
  if (fn === null || !isFunctionLike(fn)) {
    return null;
  }
  if (varKind !== VarKind.Const) {
    throw new UnsupportedError(`component$ of "${name}", which is not a const`);
  }
  return fn;
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

/**
 * JSX is what the `return` yields: the element itself or an arm around it. JSX handed to a call
 * (`renderToStream(<Root />)`) is a value the function uses, not what it renders — the only signal
 * an anonymous default export has, since it carries no component name.
 */
function isJsxReturnValue(node: unknown): boolean {
  const value = isNode(node) ? unwrapExpression(node) : null;
  if (value === null) {
    return false;
  }
  switch (value.type) {
    case 'JSXElement':
    case 'JSXFragment':
      return true;
    case 'ConditionalExpression':
      return isJsxReturnValue(value.consequent) || isJsxReturnValue(value.alternate);
    case 'LogicalExpression':
      return isJsxReturnValue(value.left) || isJsxReturnValue(value.right);
    case 'SequenceExpression':
      return isJsxReturnValue(value.expressions[value.expressions.length - 1]);
    default:
      return false;
  }
}

function returnPositionContainsJsx(fn: Node, jsx: JsxAnalysis, anonymous: boolean): boolean {
  const returnsJsx = anonymous
    ? isJsxReturnValue
    : (value: unknown) => isNode(value) && jsx.read(unwrapExpression(value) ?? value).hasJsxValue;
  const body = unwrapExpression((fn as WalkableNode).body);
  if (body?.type !== 'BlockStatement') {
    return returnsJsx(body);
  }
  let found = false;
  visitReturns(body, (argument) => {
    found ||= returnsJsx(argument);
  });
  return found;
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
