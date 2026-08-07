import { getIdentifierName, getRange, unwrapExpression } from './ast-utils';
import { ValueIrKind } from './expr-ir';
import { lowerValueIr, type ExprLowerFacts } from './expr-lower';
import type { ValueIR } from './expr-ir';
import type { BindingId } from './plan-types';
import { SetupOpKind, TaskStepKind } from './setup-ir';
import type { SetupOp, TaskBody, TaskStep } from './setup-ir';
import type { AstNode, SourceRange } from './types';
import { QwikHooks } from './words';

/**
 * Lowers one linear setup statement to a `SetupOp` (specs/03), or null when the statement is
 * outside the v1 portable subset — the caller keeps the verbatim-source path. Never guesses.
 */
export interface SetupLowerFacts extends ExprLowerFacts {
  /** True when `callee` is the named hook imported from a qwik package (by BindingId). */
  isHook(callee: unknown, hook: string): boolean;
  /** Extracted QRL segment id whose function range equals `range`, if any. */
  findQrlSegmentId(range: SourceRange | null): string | null;
}

export interface SetupOpCoverage {
  total: number;
  lowered: number;
}

let activeCoverage: SetupOpCoverage | null = null;

/** Test-only coverage tap mirroring the expression tap. */
export function startSetupOpCoverage(): SetupOpCoverage {
  const coverage: SetupOpCoverage = { total: 0, lowered: 0 };
  activeCoverage = coverage;
  return coverage;
}

export function stopSetupOpCoverage(): void {
  activeCoverage = null;
}

export function reportSetupOpSite(lowered: boolean): void {
  if (activeCoverage === null) {
    return;
  }
  activeCoverage.total++;
  if (lowered) {
    activeCoverage.lowered++;
  }
}

export function lowerSetupOp(statement: AstNode, facts: SetupLowerFacts): SetupOp | null {
  if (statement.type === 'VariableDeclaration') {
    return lowerDeclaration(statement, facts);
  }
  if (statement.type === 'ExpressionStatement') {
    const expression = unwrapExpression((statement as { expression: unknown }).expression);
    if (expression?.type === 'CallExpression') {
      return lowerStatementCall(expression, facts);
    }
    if (expression?.type === 'AwaitExpression') {
      return lowerAwaitStatement(expression, facts);
    }
  }
  return null;
}

/** `await <expr>` lowers like any call: the awaited expression rides the yield op as IR. */
function lowerAwaitStatement(expression: AstNode, facts: SetupLowerFacts): SetupOp | null {
  const awaited = unwrapExpression((expression as { argument: unknown }).argument);
  if (awaited == null) {
    return null;
  }
  const value = lowerValueIr(awaited, facts);
  return value === null ? null : { kind: SetupOpKind.Statement, value, await: true };
}

function lowerDeclaration(statement: AstNode, facts: SetupLowerFacts): SetupOp | null {
  const declaration = statement as { kind: string; declarations: unknown[] };
  if (declaration.kind !== 'const' || declaration.declarations.length !== 1) {
    return null;
  }
  const declarator = declaration.declarations[0] as { id?: unknown; init?: unknown };
  const id = declarator.id as AstNode | undefined;
  if (id === undefined || id.type !== 'Identifier') {
    return null; // destructuring declarations stay verbatim
  }
  const local = facts.bindingIdAt(getRange(id));
  if (local === null) {
    return null;
  }
  const init = unwrapExpression(declarator.init);
  if (init === null || init === undefined) {
    return null;
  }
  if (init.type === 'CallExpression') {
    return lowerHookInit(init, local, facts);
  }
  const value = lowerValueIr(init, facts);
  return value === null ? null : { kind: SetupOpKind.Const, binding: local, init: value };
}

function lowerHookInit(call: AstNode, local: BindingId, facts: SetupLowerFacts): SetupOp | null {
  const { callee, arguments: args } = call as { callee: unknown; arguments: unknown[] };
  if (facts.isHook(callee, QwikHooks.Dollar)) {
    const target = unwrapExpression(args[0]);
    const segment = facts.findQrlSegmentId(target === null ? null : getRange(target ?? null));
    return args.length === 1 && segment !== null
      ? { kind: SetupOpKind.QrlConst, binding: local, segment }
      : null;
  }
  if (facts.isHook(callee, QwikHooks.UseSignal)) {
    const init = lowerSingleArg(args, facts);
    return init === undefined
      ? null
      : { kind: SetupOpKind.Signal, binding: local, init: init ?? { kind: ValueIrKind.Undef } };
  }
  if (facts.isHook(callee, QwikHooks.UseStore)) {
    if (args.length !== 1) {
      return null; // options bag (deep/shallow/reactive) stays verbatim in v1
    }
    const init = lowerValueIr(args[0], facts);
    return init === null ? null : { kind: SetupOpKind.Store, binding: local, init, deep: true };
  }
  if (facts.isHook(callee, QwikHooks.UseConstant)) {
    const init = lowerSingleArg(args, facts);
    return init === undefined || init === null
      ? null
      : { kind: SetupOpKind.Const, binding: local, init };
  }
  if (facts.isHook(callee, QwikHooks.UseId)) {
    return args.length === 0 ? { kind: SetupOpKind.UseId, binding: local } : null;
  }
  if (facts.isHook(callee, QwikHooks.UseContext)) {
    const context = contextBinding(args, facts);
    return context === null || args.length !== 1
      ? null
      : { kind: SetupOpKind.ContextRead, binding: local, context };
  }
  if (facts.isHook(callee, QwikHooks.UseServerData)) {
    if (args.length === 0 || args.length > 2) {
      return null;
    }
    const key = lowerValueIr(args[0], facts);
    if (key === null) {
      return null;
    }
    const fallback = args.length === 2 ? lowerValueIr(args[1], facts) : null;
    if (args.length === 2 && fallback === null) {
      return null;
    }
    return { kind: SetupOpKind.ServerData, binding: local, key, fallback };
  }
  if (facts.isHook(callee, QwikHooks.UseComputedDollar)) {
    const segment = callbackSegmentId(args, facts);
    if (segment === null || args.length !== 1) {
      return null;
    }
    return {
      kind: SetupOpKind.Computed,
      binding: local,
      segment,
      body: callbackBodyIr(args[0], facts),
    };
  }
  // non-hook calls lower like any expression; only pure qwik: ops and defs qualify
  const value = lowerValueIr(call, facts);
  return value === null ? null : { kind: SetupOpKind.Const, binding: local, init: value };
}

/** Statement-position hooks: providers, tasks, visible tasks. */
function lowerStatementCall(call: AstNode, facts: SetupLowerFacts): SetupOp | null {
  const { callee, arguments: args } = call as { callee: unknown; arguments: unknown[] };
  if (facts.isHook(callee, QwikHooks.UseContextProvider)) {
    return lowerProviderCall(call, facts);
  }
  if (facts.isHook(callee, QwikHooks.UseTaskDollar)) {
    const segment = callbackSegmentId(args, facts);
    if (segment === null || args.length !== 1) {
      return null;
    }
    return { kind: SetupOpKind.Task, segment, body: lowerTaskBody(args[0], facts) };
  }
  if (facts.isHook(callee, QwikHooks.UseVisibleTaskDollar)) {
    const segment = callbackSegmentId(args, facts);
    if (segment === null || args.length > 2) {
      return null;
    }
    const strategy = args.length === 2 ? visibleTaskStrategy(args[1]) : 'intersection-observer';
    return strategy === null ? null : { kind: SetupOpKind.VisibleTask, segment, strategy };
  }
  // any other bare call — custom hooks included — is evaluate-and-discard when its IR lowers.
  // Unrecognized @qwik.dev calls stay out: claimPluginCall refuses framework sources.
  const value = lowerValueIr(call, facts);
  return value === null ? null : { kind: SetupOpKind.Statement, value };
}

function callbackSegmentId(args: unknown[], facts: SetupLowerFacts): string | null {
  const callback = unwrapExpression(args[0]);
  if (callback === null || callback === undefined) {
    return null;
  }
  return facts.findQrlSegmentId(getRange(callback));
}

/** Portable body of a computed callback: expression body or a single-`return` block. */
function callbackBodyIr(callback: unknown, facts: SetupLowerFacts): ValueIR | null {
  const arrow = unwrapExpression(callback) as
    | (AstNode & { params?: unknown[]; body?: unknown; async?: boolean })
    | null
    | undefined;
  if (
    arrow?.type !== 'ArrowFunctionExpression' ||
    arrow.async === true ||
    (arrow.params?.length ?? 0) !== 0
  ) {
    return null;
  }
  const body = arrow.body as AstNode;
  if (body.type !== 'BlockStatement') {
    return lowerValueIr(body, facts);
  }
  const statements = (body as { body: unknown[] }).body;
  const only = statements.length === 1 ? (statements[0] as AstNode & { argument?: unknown }) : null;
  if (only === null || only.type !== 'ReturnStatement' || only.argument == null) {
    return null;
  }
  return lowerValueIr(only.argument, facts);
}

function visibleTaskStrategy(
  options: unknown
): 'intersection-observer' | 'document-ready' | 'document-idle' | null {
  const node = unwrapExpression(options);
  if (node?.type !== 'ObjectExpression') {
    return null;
  }
  const properties = (node as { properties: unknown[] }).properties;
  if (properties.length !== 1) {
    return null;
  }
  const prop = properties[0] as { type: string; kind?: string; key?: unknown; value?: unknown };
  if (
    prop.type !== 'Property' ||
    prop.kind !== 'init' ||
    getIdentifierName(prop.key) !== 'strategy'
  ) {
    return null;
  }
  const value = unwrapExpression(prop.value) as (AstNode & { value?: unknown }) | null | undefined;
  const strategy = value?.type === 'Literal' ? value.value : null;
  return strategy === 'intersection-observer' ||
    strategy === 'document-ready' ||
    strategy === 'document-idle'
    ? strategy
    : null;
}

/** V3 tasks auto-track reads; the body lowers only when every statement is step-expressible. */
function lowerTaskBody(callback: unknown, facts: SetupLowerFacts): TaskBody | null {
  const arrow = unwrapExpression(callback) as
    | (AstNode & { params?: unknown[]; body?: unknown; async?: boolean })
    | null
    | undefined;
  if (
    arrow?.type !== 'ArrowFunctionExpression' ||
    (arrow.params?.length ?? 0) !== 0 // TaskCtx (cleanup) usage stays verbatim in v1
  ) {
    return null;
  }
  const body = arrow.body as AstNode;
  const statements =
    body.type === 'BlockStatement' ? ((body as { body: unknown[] }).body as AstNode[]) : null;
  if (statements === null) {
    return null;
  }
  const steps = lowerTaskSteps(statements, facts);
  return steps === null ? null : { steps, async: arrow.async === true };
}

function lowerTaskSteps(statements: readonly unknown[], facts: SetupLowerFacts): TaskStep[] | null {
  const steps: TaskStep[] = [];
  for (const statement of statements) {
    const step = lowerTaskStep(statement as AstNode, facts);
    if (step === null) {
      return null;
    }
    steps.push(step);
  }
  return steps;
}

function lowerTaskStep(statement: AstNode, facts: SetupLowerFacts): TaskStep | null {
  switch (statement.type) {
    case 'ExpressionStatement': {
      const expression = unwrapExpression((statement as { expression: unknown }).expression);
      if (expression?.type !== 'AssignmentExpression') {
        return null;
      }
      return lowerAssignment(expression, facts);
    }
    case 'VariableDeclaration': {
      const declaration = statement as { kind: string; declarations: unknown[] };
      if (declaration.declarations.length !== 1) {
        return null;
      }
      const declarator = declaration.declarations[0] as { id?: unknown; init?: unknown };
      const id = declarator.id as AstNode | undefined;
      const local = id?.type === 'Identifier' ? facts.bindingIdAt(getRange(id)) : null;
      const value = local === null ? null : lowerValueIr(declarator.init, facts);
      return local === null || value === null
        ? null
        : { s: TaskStepKind.Let, binding: local, value };
    }
    case 'IfStatement': {
      const conditional = statement as { test: unknown; consequent: unknown; alternate?: unknown };
      const test = lowerValueIr(conditional.test, facts);
      const then = test === null ? null : lowerTaskBranch(conditional.consequent, facts);
      const alternate =
        then === null
          ? null
          : conditional.alternate == null
            ? []
            : lowerTaskBranch(conditional.alternate, facts);
      return test === null || then === null || alternate === null
        ? null
        : { s: TaskStepKind.If, test, then, else: alternate };
    }
    case 'ReturnStatement': {
      const argument = (statement as { argument?: unknown }).argument;
      if (argument == null) {
        return { s: TaskStepKind.Return, value: null };
      }
      const value = lowerValueIr(argument, facts);
      return value === null ? null : { s: TaskStepKind.Return, value };
    }
    default:
      return null;
  }
}

function lowerTaskBranch(node: unknown, facts: SetupLowerFacts): TaskStep[] | null {
  const branch = node as AstNode;
  if (branch.type === 'BlockStatement') {
    return lowerTaskSteps((branch as { body: unknown[] }).body, facts);
  }
  const step = lowerTaskStep(branch, facts);
  return step === null ? null : [step];
}

function lowerAssignment(expression: AstNode, facts: SetupLowerFacts): TaskStep | null {
  const assignment = expression as { operator: string; left: unknown; right: unknown };
  if (assignment.operator !== '=') {
    return null;
  }
  const value = lowerValueIr(assignment.right, facts);
  if (value === null) {
    return null;
  }
  const target = unwrapExpression(assignment.left);
  if (target?.type !== 'MemberExpression') {
    return null;
  }
  // walk the member chain down to the root identifier, collecting the path
  const path: (string | ValueIR)[] = [];
  let current: AstNode | null | undefined = target;
  while (current?.type === 'MemberExpression') {
    const member = current as {
      object: unknown;
      property: unknown;
      computed: boolean;
      optional?: boolean;
    };
    if (member.optional === true) {
      return null;
    }
    if (member.computed) {
      const key = lowerValueIr(member.property, facts);
      if (key === null) {
        return null;
      }
      path.unshift(key);
    } else {
      const name = getIdentifierName(member.property);
      if (name === null) {
        return null;
      }
      path.unshift(name);
    }
    current = unwrapExpression(member.object);
  }
  if (current?.type !== 'Identifier') {
    return null;
  }
  const binding = facts.bindingIdAt(getRange(current));
  if (binding === null) {
    return null;
  }
  if (path.length === 1 && path[0] === 'value' && facts.isSourceBinding(binding)) {
    return { s: TaskStepKind.SetSignal, binding, value };
  }
  return { s: TaskStepKind.SetStore, binding, path, value };
}

function lowerProviderCall(call: AstNode, facts: SetupLowerFacts): SetupOp | null {
  const { callee, arguments: args } = call as { callee: unknown; arguments: unknown[] };
  if (!facts.isHook(callee, QwikHooks.UseContextProvider) || args.length !== 2) {
    return null;
  }
  const context = contextBinding(args, facts);
  const value = context === null ? null : lowerValueIr(args[1], facts);
  return context === null || value === null
    ? null
    : { kind: SetupOpKind.ContextProvider, context, value };
}

/** Null = no argument; undefined = argument present but unlowerable. */
function lowerSingleArg(args: unknown[], facts: SetupLowerFacts): ValueIR | null | undefined {
  if (args.length === 0) {
    return null;
  }
  if (args.length > 1) {
    return undefined;
  }
  const value = lowerValueIr(args[0], facts);
  return value === null ? undefined : value;
}

function contextBinding(args: unknown[], facts: SetupLowerFacts): BindingId | null {
  const context = unwrapExpression(args[0]);
  if (context?.type !== 'Identifier' || getIdentifierName(context) === null) {
    return null;
  }
  return facts.bindingIdAt(getRange(context));
}
