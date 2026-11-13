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
import { identifierName, isFunctionLike, unwrapExpression, unwrapTypeExpression } from './utils';
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
  const candidates: ComponentCandidate[] = [];
  const declare = (value: Node, id: Node | null, statement: Statement) => {
    const node = unwrapExpression(value) ?? value;
    const name = identifierName(id);
    if (!isComponentDeclaration(node, bindings, coreBindings)) {
      if (
        isHeuristicComponent(node, id === null ? null : bindings.declaration(id), jsx, bindings)
      ) {
        candidates.push({ statement, fn: node, name });
      }
      return;
    }
    const fn = declaredComponentFunction(node, bindings);
    if (fn === null) {
      return;
    }
    const argument = unwrapExpression(node.arguments[0])!;
    candidates.push({ statement, fn, name, ...(fn === argument ? {} : { reference: argument }) });
  };
  forEachModuleDeclaration(program, (declaration, statement) => {
    if (declaration.type !== 'VariableDeclaration') {
      declare(declaration, isFunctionLike(declaration) ? declaration.id : null, statement);
      return;
    }
    for (const declarator of declaration.declarations) {
      if (declarator.init !== null) {
        declare(declarator.init, declarator.id, statement);
      }
    }
  });
  return candidates;
}

/** `binding` names the function; null for an anonymous default export. */
export function isHeuristicComponent(
  fn: Node,
  binding: LocalId | null,
  jsx: JsxAnalysis,
  bindings: BindingGraph
): boolean {
  const name = binding === null ? null : bindings.bindings[binding].name;
  return (
    isFunctionLike(fn) &&
    hasComponentName(name) &&
    returnPositionContainsJsx(fn, jsx, name === null) &&
    !isCalledDirectly(binding, bindings)
  );
}

/** A local its code calls as `X(…)` is a plain function, whatever else reads it. */
function isCalledDirectly(binding: LocalId | null, bindings: BindingGraph): boolean {
  // Another module may render a module function as a tag, so it stays a component.
  if (binding === null || bindings.bindings[binding].scope === BindingScope.Module) {
    return false;
  }
  const references = bindings.referencesOf(binding);
  const isCallee = (node: Node) => {
    let call = bindings.parentOf(node);
    while (call !== null && call.type !== 'CallExpression') {
      call = bindings.parentOf(call);
    }
    return call !== null && unwrapTypeExpression(call.callee) === node;
  };
  if (!references.some(({ node }) => isCallee(node))) {
    return false;
  }
  // A tag renders a component's output, which a plain function's JSX value is not.
  if (references.some(({ node }) => bindings.parentOf(node)?.type === 'JSXOpeningElement')) {
    const { name } = bindings.bindings[binding];
    throw new UnsupportedError(`"${name}" called as a function and also rendered as <${name} />`);
  }
  return true;
}

/** `component$(…)` through its core import, under any alias: a component declared in place. */
export function isComponentDeclaration(
  node: Node,
  bindings: BindingGraph,
  coreBindings: ReadonlyMap<LocalId, string>
): node is CallExpression {
  if (node.type !== 'CallExpression') {
    return false;
  }
  const binding = bindings.reference(node.callee);
  return binding !== null && coreBindings.get(binding) === QwikMarker.Component;
}

/**
 * The function a `component$(…)` compiles, inline or named; null leaves the call a runtime identity
 * (an import, a parameter).
 */
export function declaredComponentFunction(
  call: CallExpression,
  bindings: BindingGraph
): ArrowFunctionExpression | FunctionNode | null {
  const [argument] = call.arguments;
  if (argument === undefined || argument.type === 'SpreadElement' || call.arguments.length !== 1) {
    throw new UnsupportedError('component$ without exactly one argument');
  }
  const value = unwrapExpression(argument);
  return isFunctionLike(value) ? value : referencedComponentFunction(value, bindings);
}

/** `component$(X)` compiles the function `X` names as if it were written inline. */
function referencedComponentFunction(
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
