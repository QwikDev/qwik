/**
 * Which locals below module level lift to their own segment, decided from the AST before lowering:
 * a local lifts once a segment boundary reads it, and its scope declares it only if its own code
 * reads it too.
 */
import type {
  ArrowFunctionExpression,
  CallExpression,
  Expression,
  Function as FunctionNode,
  JSXAttributeItem,
  JSXElement,
  JSXFragment,
  Node,
  Program,
  VariableDeclarator,
} from 'oxc-parser';
import { BindingScope, type LocalId } from '../../schema';
import { isNode, type WalkableNode } from './ast-types';
import type { BindingGraph } from './bindings';
import { JsxValueKind, type JsxValue } from './jsx-analysis';
import {
  declaredComponentFunction,
  findComponentCandidates,
  findHookCandidates,
  isComponentDeclaration,
  isHeuristicComponent,
} from './returns-jsx';
import { isFunctionLike, jsxAttributeName, unwrapExpression, unwrapTypeExpression } from './utils';
import { eventScopeName, isDroppedEventAttribute, passiveEventNames } from '../events';
import type { LowerContext } from '../lower-context';
import { markerQrlCall, type MarkerScope } from '../lower-function';
import { isFragmentArray, readRenderBranch } from '../lower-children';
import { isLiteralArray, selectRowKey } from '../lower-array';
import { expandLiteralSpread, isKeyAttribute } from '../lower-element';
import { jsxMemberRoot } from '../lower-component';
import { QRL_SUFFIX, QwikDirective } from '../../words';

export interface LiftAnalysis {
  /** The locals today's rules let lift, lifted or not. */
  liftables: ReadonlyMap<LocalId, Liftable>;
  isLifted(binding: LocalId): boolean;
  /** Code its own scope runs reads it, so that scope declares it. */
  isDeclared(binding: LocalId): boolean;
  /** `reference` is code of `boundary` itself: not a nested boundary's, not a `$(local)` argument. */
  isOwnRead(reference: Node, boundary: Node | readonly Node[]): boolean;
  /** Lowering drops the code around `reference`, so it reads nothing. */
  isDropped(reference: Node): boolean;
  /** The function a `component$(fn)` call or a component written as a plain function compiles. */
  componentFunction(node: Node): LocalFunction | null;
}

export type LocalFunction = ArrowFunctionExpression | FunctionNode;

/** What the analysis reads: it runs while the lower context is created. */
type LiftScope = MarkerScope & Pick<LowerContext, 'jsx'>;

export interface Liftable {
  /** The local whose segment it names: an alias's target, otherwise itself. */
  binding: LocalId;
  /** The function its segment compiles. */
  fn: LocalFunction;
  /** What a component's segment spans; null for a plain function. */
  component: Node | null;
  /** The function the declaration sits in. */
  home: Node;
  references: readonly Node[];
}

/** How the statements being visited run. */
const enum Statements {
  Plain,
  /** Code a segment boundary runs: a function there is a component only as `component$`. */
  Qrl,
  /** A custom hook's setup: its locals lift, its `return` is a value. */
  Hook,
  /** A component's or a row's setup: its locals lift, its `return` renders. */
  Render,
}

/** Mirrors where lowering cuts segments; an inline value form never reads a local function. */
function collectBoundaries(program: Pick<Program, 'body'>, ctx: LiftScope) {
  const { bindings, coreBindings, jsx } = ctx;
  /** Code that runs in a segment of its own. */
  const regions = new Set<Node>();
  /** Identifiers passed as a QRL value: `$(f)`, `<Child then$={f} />`. */
  const qrlOf = new Set<Node>();
  /** Code lowering never emits. */
  const dropped = new Set<Node>();
  /** Regions whose code also runs where they stand. */
  const inPlace = new Set<Node>();
  const components = new Set<Node>(
    findComponentCandidates(program, jsx, bindings, coreBindings).map(({ fn }) => fn)
  );
  const hooks = new Set<Node>(
    findHookCandidates(program, bindings)
      .map(({ fn }) => fn)
      .filter((fn) => !components.has(fn))
  );
  const setupScopes = new Set<Node>(hooks);
  /** Functions their own declaration makes components, not a `component$(f)` reading them. */
  const declaredComponents = new Set<Node>();
  const visitedComponents = new Set<Node>();

  const addRegion = (node: Node) => regions.add(unwrapExpression(node)!);

  /** Lowering evaluates a `key` only as a row's key, which is a region of its own. */
  const dropKey = (key: JSXAttributeItem) => {
    const value = attributeValue(key);
    if (value === null || regions.has(unwrapExpression(value)!)) {
      return false;
    }
    dropped.add(value);
    return true;
  };

  const visitJs = (node: unknown, statements: Statements): void => {
    if (Array.isArray(node)) {
      node.forEach((child) => visitJs(child, statements));
      return;
    }
    if (!isNode(node)) {
      return;
    }
    if (regions.has(node)) {
      statements = Statements.Qrl;
    }
    // A JSX value in JavaScript position is its own render QRL.
    if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      addRegion(node);
      visitJsx(node);
      return;
    }
    if (node.type === 'CallExpression' && visitBoundaryCall(node, statements)) {
      return;
    }
    if (statements !== Statements.Qrl) {
      registerComponents(node);
    }
    if (isFunctionLike(node)) {
      visitFunction(node, statements === Statements.Qrl ? Statements.Qrl : Statements.Plain);
      return;
    }
    if (statements === Statements.Render && node.type === 'ReturnStatement') {
      visitRender(node.argument);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key !== 'parent') {
        visitJs((node as WalkableNode)[key], statements);
      }
    }
  };

  /** `component$(fn)` and `$`-marker calls; false leaves an ordinary call to the caller. */
  const visitBoundaryCall = (call: CallExpression, statements: Statements): boolean => {
    const marker = markerQrlCall(call, ctx);
    if (marker !== null) {
      if (marker.argument.type === 'Identifier') {
        qrlOf.add(marker.argument);
      } else {
        addRegion(marker.argument);
      }
      visitJs(call.callee, statements);
      visitJs(call.arguments, Statements.Plain);
      return true;
    }
    // An unresolved `component$(x)` keeps its runtime call.
    const fn = isComponentDeclaration(call, bindings, coreBindings)
      ? declaredComponentFunction(call, bindings)
      : null;
    if (fn === null) {
      return false;
    }
    components.add(fn);
    visitFunction(fn);
    return true;
  };

  /** A component written as a plain function is a setup of its own, as `component$` makes one. */
  const registerComponents = (node: Node) => {
    const declared: [Node | null, Node | null][] =
      node.type === 'FunctionDeclaration'
        ? [[node, node.id]]
        : node.type === 'VariableDeclaration' && node.kind === 'const'
          ? node.declarations.map(({ id, init }) => [unwrapExpression(init), id])
          : [];
    for (const [fn, id] of declared) {
      if (
        fn !== null &&
        isHeuristicComponent(fn, id === null ? null : bindings.declaration(id), jsx, bindings)
      ) {
        components.add(fn);
        declaredComponents.add(fn);
      }
    }
  };

  const visitFunction = (fn: LocalFunction, statements = Statements.Plain) => {
    if (components.has(fn)) {
      visitComponent(fn);
      return;
    }
    visitJs(fn.params, statements);
    visitJs(fn.body, hooks.has(fn) ? Statements.Hook : statements);
  };

  const visitComponent = (fn: LocalFunction) => {
    if (!visitedComponents.has(fn)) {
      visitedComponents.add(fn);
      visitSetup(fn);
    }
  };

  /** A component's or a row's function: its body is a setup whose `return` renders. */
  const visitSetup = (fn: LocalFunction) => {
    setupScopes.add(fn);
    visitJs(fn.params, Statements.Plain);
    if (fn.body?.type === 'BlockStatement') {
      visitJs(fn.body.body, Statements.Render);
    } else {
      visitRender(fn.body);
    }
  };

  /** Mirrors `lowerRenderExpression`. */
  const visitRender = (expression: Node | null): void => {
    if (expression === null) {
      return;
    }
    const node = unwrapExpression(
      expression.type === 'JSXExpressionContainer' ? expression.expression : expression
    )!;
    const value = jsx.read(node);
    const branch = readRenderBranch(value);
    if (branch !== null) {
      addRegion(branch.test);
      visitJs(branch.test, Statements.Plain);
      for (const arm of [branch.then.expression, branch.else?.expression ?? null]) {
        if (arm !== null) {
          addRegion(arm);
          visitRender(arm);
        }
      }
      return;
    }
    switch (value.kind) {
      case JsxValueKind.Empty:
        return;
      case JsxValueKind.Element:
        visitJsx(value.node);
        return;
      case JsxValueKind.Fragment:
        visitChildren(value.node.children);
        return;
      case JsxValueKind.Collection:
        visitCollection(value);
        return;
    }
    if (isFragmentArray(node)) {
      node.elements.forEach(visitRender);
      return;
    }
    addRegion(node);
    visitJs(node, Statements.Plain);
  };

  const visitChildren = (children: readonly Node[]) => {
    for (const child of children) {
      if (child.type !== 'JSXText') {
        visitRender(child);
      }
    }
  };

  /** A literal array renders its rows lexically; any other source and its rows are segments. */
  const visitCollection = (value: Extract<JsxValue, { kind: JsxValueKind.Collection }>) => {
    const { callback, source } = value;
    const isLexical = isLiteralArray(source);
    if (!isLexical) {
      addRegion(source);
      addRegion(callback);
      // The keys the row selects, and the tests choosing them, run in its key segment.
      const keys = new Map<Node, Expression>();
      if (value.body !== null) {
        selectRowKey(jsx.read(value.body.expression), keys);
      }
      keys.forEach(addRegion);
    }
    visitJs(source, Statements.Plain);
    visitSetup(callback);
  };

  const visitJsx = (element: JSXElement | JSXFragment) => {
    if (element.type === 'JSXFragment') {
      visitChildren(element.children);
      return;
    }
    const name = element.openingElement.name;
    if (name.type === 'JSXMemberExpression') {
      // A member tag on a local root can change, so the whole element is a content range.
      const binding = bindings.reference(jsxMemberRoot(name));
      const scope = binding === null ? null : bindings.bindings[binding].scope;
      if (scope !== null && scope !== BindingScope.Module && scope !== BindingScope.Import) {
        addRegion(element);
      }
      visitComponentTag(element, undefined);
      return;
    }
    if (name.type === 'JSXIdentifier' && !/^[a-z]/.test(name.name)) {
      const binding = bindings.reference(name);
      visitComponentTag(element, binding === null ? undefined : coreBindings.get(binding));
      return;
    }
    visitElement(element);
  };

  /** Mirrors `lowerJsx` for a native element: only a few attributes evaluate in place. */
  const visitElement = (element: JSXElement) => {
    const attributes = element.openingElement.attributes
      .filter((attribute) => !isKeyAttribute(attribute) || !dropKey(attribute))
      .flatMap(expandLiteralSpread);
    // Any remaining spread makes the attribute list one props chunk.
    const hasSpread = attributes.some((attribute) => attribute.type === 'JSXSpreadAttribute');
    const tag = element.openingElement.name;
    const tagName = tag.type === 'JSXIdentifier' ? tag.name : null;
    const passiveEvents = passiveEventNames(attributes);
    for (const attribute of attributes) {
      const value = attributeValue(attribute);
      if (value === null) {
        continue;
      }
      const name = jsxAttributeName(attribute);
      if (!hasSpread && name !== null && isDroppedEventAttribute(name, passiveEvents)) {
        dropped.add(value);
        continue;
      }
      if (value.type === 'JSXElement' || value.type === 'JSXFragment') {
        addRegion(value);
        visitJsx(value);
        continue;
      }
      if (hasSpread || !isInlineAttribute(name)) {
        addRegion(value);
      }
      // A textarea value is a client prop segment and also its text, rendered in place.
      if (!hasSpread && tagName === 'textarea' && name === 'value') {
        inPlace.add(unwrapExpression(value)!);
      }
      visitJs(value, Statements.Plain);
    }
    const hasInnerHtml = attributes.some(
      (attribute) => jsxAttributeName(attribute) === QwikDirective.InnerHtml
    );
    if (hasInnerHtml) {
      element.children.forEach((child) => dropped.add(child));
    } else {
      visitChildren(element.children);
    }
  };

  /** Mirrors `lowerComponentOp` and the core tags `lowerJsx` handles itself. */
  const visitComponentTag = (element: JSXElement, core: string | undefined) => {
    for (const attribute of element.openingElement.attributes) {
      const value = attributeValue(attribute);
      if (value === null) {
        continue;
      }
      const name = jsxAttributeName(attribute);
      if (isKeyAttribute(attribute) && dropKey(attribute)) {
        continue;
      }
      if (core === 'Reveal' || (core === 'Pending' && name === 'delay')) {
        visitJs(value, Statements.Plain);
        continue;
      }
      // A Catch `fallback$` lowers to a fallback segment that reads its value.
      if (isQrlProp(name) && core !== 'Catch' && value.type === 'Identifier') {
        qrlOf.add(value);
        continue;
      }
      addRegion(value);
      if (value.type === 'JSXElement' || value.type === 'JSXFragment') {
        visitJsx(value);
      } else {
        visitJs(value, Statements.Plain);
      }
    }
    if (core === 'Fragment' || core === 'Reveal') {
      visitChildren(element.children);
      return;
    }
    for (const child of element.children) {
      if (child.type !== 'JSXText') {
        addRegion(child);
        visitRender(child);
      }
    }
  };

  for (const statement of program.body) {
    if (statement.type !== 'ImportDeclaration') {
      visitJs(statement, Statements.Plain);
    }
  }
  return { regions, qrlOf, dropped, inPlace, setupScopes, components, declaredComponents };
}

function attributeValue(attribute: JSXAttributeItem): Node | null {
  if (attribute.type === 'JSXSpreadAttribute') {
    return attribute.argument;
  }
  const value = attribute.value;
  if (value?.type !== 'JSXExpressionContainer') {
    return value;
  }
  return value.expression.type === 'JSXEmptyExpression' ? null : value.expression;
}

/** Element attributes `lowerAttribute` evaluates where the element renders. */
function isInlineAttribute(name: string | null): boolean {
  return name === QwikDirective.Ref || name?.startsWith('bind:') === true;
}

/** A `x$` component prop that is not an event: its value is a QRL. */
function isQrlProp(name: string | null): boolean {
  return name !== null && name.endsWith(QRL_SUFFIX) && eventScopeName(name) === null;
}

export function createLiftAnalysis(program: Pick<Program, 'body'>, ctx: LiftScope): LiftAnalysis {
  const { bindings, coreBindings } = ctx;
  const { regions, qrlOf, dropped, inPlace, setupScopes, components, declaredComponents } =
    collectBoundaries(program, ctx);
  const componentFunction = (node: Node): LocalFunction | null =>
    isComponentDeclaration(node, bindings, coreBindings)
      ? declaredComponentFunction(node, bindings)
      : declaredComponents.has(node)
        ? (node as LocalFunction)
        : null;
  const droppedReads = new Set<Node>(bindings.freeReferences([...dropped]).map(({ node }) => node));
  const liftables = new Map<LocalId, Liftable>();
  const visited = new Set<LocalId>();
  const liftableOf = (binding: LocalId): Liftable | null => {
    if (visited.has(binding)) {
      return liftables.get(binding) ?? null;
    }
    visited.add(binding);
    const liftable = readLiftable(
      binding,
      bindings,
      setupScopes,
      componentFunction,
      droppedReads,
      liftableOf
    );
    if (liftable !== null) {
      liftables.set(binding, liftable);
    }
    return liftable;
  };
  bindings.bindings.forEach((_, binding) => liftableOf(binding));
  const lifted = new Set<LocalId>();
  const liftedFunctions = new Set<Node>();
  const cutsSegment = (node: Node) => regions.has(node) || liftedFunctions.has(node);
  /** Code that runs in place is also its enclosing scope's own code. */
  const cutsOwnCode = (node: Node) => cutsSegment(node) && !inPlace.has(node);
  /** Walking up from `reference`, the code of `own` comes before any cut. */
  const isReadBy = (reference: Node, own: readonly Node[], isCut = cutsOwnCode) => {
    if (qrlOf.has(reference)) {
      return false;
    }
    for (let node: Node | null = reference; node !== null; node = bindings.parentOf(node)) {
      if (own.includes(node)) {
        return true;
      }
      if (isCut(node)) {
        return false;
      }
    }
    return false;
  };
  const isHomeRead = ({ home, references }: Liftable) =>
    references.some((reference) => !droppedReads.has(reference) && isReadBy(reference, [home]));
  /** Lowering names a hole by its container too; only a projected child is the container itself. */
  const boundaryNode = (node: Node) =>
    unwrapExpression(
      node.type === 'JSXExpressionContainer' && !regions.has(node) ? node.expression : node
    )!;
  const isBoundaryRead = ({ home, references }: Liftable) =>
    references.some((reference) => !isReadBy(reference, [home], cutsSegment));
  // A function segment cannot print a component in place, so the component gets its own.
  const isInLiftedFunction = ({ component, home }: Liftable) =>
    component !== null && liftedFunctions.has(home) && !components.has(home);
  // Lifting a function makes it a boundary for what it reads, so iterate to the least fixpoint.
  let isSettled = false;
  while (!isSettled) {
    isSettled = true;
    for (const liftable of liftables.values()) {
      const { binding } = liftable;
      if (!lifted.has(binding) && (isBoundaryRead(liftable) || isInLiftedFunction(liftable))) {
        lifted.add(binding);
        liftedFunctions.add(liftable.fn);
        isSettled = false;
      }
    }
  }
  const isLifted = (binding: LocalId) => {
    const liftable = liftables.get(binding);
    return liftable !== undefined && lifted.has(liftable.binding);
  };
  // An alias nothing reads loses its declaration, and with it that declaration's read.
  const declared = new Set([...liftables.keys()].filter(isLifted));
  for (let isSettled = false; !isSettled; ) {
    isSettled = true;
    for (const binding of declared) {
      const liftable = liftables.get(binding)!;
      if (!isHomeRead(liftable)) {
        declared.delete(binding);
        isSettled = false;
        if (liftable.binding !== binding) {
          const [alias] = bindings.declarationsOf(binding) as VariableDeclarator[];
          droppedReads.add(unwrapTypeExpression(alias.init!));
        }
      }
    }
  }
  return {
    liftables,
    isLifted,
    isDeclared: (binding) => declared.has(binding),
    isOwnRead: (reference, boundary) => isReadBy(reference, [boundary].flat().map(boundaryNode)),
    isDropped: (reference) => droppedReads.has(reference),
    componentFunction,
  };
}

/**
 * A never-written local function, `function` declaration or component, in any scope, or a
 * never-written alias of one (`const g = f`), which names its target's segment.
 */
function readLiftable(
  binding: LocalId,
  bindings: BindingGraph,
  setupScopes: ReadonlySet<Node>,
  componentFunction: (node: Node) => LocalFunction | null,
  droppedReads: ReadonlySet<Node>,
  liftableOf: (binding: LocalId) => Liftable | null
): Liftable | null {
  const { scope } = bindings.bindings[binding];
  const declarations = bindings.declarationsOf(binding);
  const references = bindings.referencesOf(binding);
  if (
    scope === BindingScope.Module ||
    scope === BindingScope.Import ||
    declarations.length !== 1 ||
    references.some(({ isWrite }) => isWrite)
  ) {
    return null;
  }
  const [declaration] = declarations;
  const home = enclosingFunction(declaration, bindings);
  if (home === null) {
    return null;
  }
  const toLiftable = (fn: LocalFunction, component: Node | null): Liftable => ({
    binding,
    fn,
    component,
    home,
    references: references.map(({ node }) => node).filter((node) => !droppedReads.has(node)),
  });
  if (declaration.type === 'FunctionDeclaration') {
    return toLiftable(declaration, componentFunction(declaration));
  }
  const statement = bindings.parentOf(declaration);
  if (
    declaration.type !== 'VariableDeclarator' ||
    declaration.id.type !== 'Identifier' ||
    declaration.init === null ||
    statement?.type !== 'VariableDeclaration'
  ) {
    return null;
  }
  const init = unwrapTypeExpression(declaration.init);
  const target = init.type === 'Identifier' ? bindings.reference(init) : null;
  const aliased = target === null ? null : liftableOf(target);
  // A boundary around a nested function cannot see the alias reads inside it.
  if (aliased !== null && aliased.home === home) {
    return { ...toLiftable(aliased.fn, aliased.component), binding: aliased.binding };
  }
  const component = componentFunction(init);
  if (component !== null) {
    // A setup lowers its components as statements; any other scope where their value stands.
    return toLiftable(component, setupScopes.has(home) ? statement : init);
  }
  return isFunctionLike(init) ? toLiftable(init, null) : null;
}

function enclosingFunction(node: Node, bindings: BindingGraph): Node | null {
  let current = bindings.parentOf(node);
  while (current !== null && !isFunctionLike(current)) {
    current = bindings.parentOf(current);
  }
  return current;
}
