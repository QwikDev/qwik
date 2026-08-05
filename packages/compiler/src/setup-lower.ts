import { getIdentifierName, getRange, unwrapExpression } from './ast-utils';
import { lowerValueIr, type ExprLowerFacts } from './expr-lower';
import type { ValueIR } from './expr-ir';
import type { BindingId } from './plan-types';
import type { SetupOp } from './setup-ir';
import type { AstNode } from './types';
import { QwikHooks } from './words';

/**
 * Lowers one linear setup statement to a `SetupOp` (specs/03), or null when the statement is
 * outside the v1 portable subset — the caller keeps the verbatim-source path. Never guesses.
 */
export interface SetupLowerFacts extends ExprLowerFacts {
  /** True when `callee` is the named hook imported from a qwik package (by BindingId). */
  isHook(callee: unknown, hook: string): boolean;
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
      return lowerProviderCall(expression, facts);
    }
  }
  return null;
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
  return value === null ? null : { op: 'const', local, init: value };
}

function lowerHookInit(call: AstNode, local: BindingId, facts: SetupLowerFacts): SetupOp | null {
  const { callee, arguments: args } = call as { callee: unknown; arguments: unknown[] };
  if (facts.isHook(callee, QwikHooks.UseSignal)) {
    const init = lowerSingleArg(args, facts);
    return init === undefined ? null : { op: 'signal', local, init: init ?? { k: 'undef' } };
  }
  if (facts.isHook(callee, QwikHooks.UseStore)) {
    if (args.length !== 1) {
      return null; // options bag (deep/shallow/reactive) stays verbatim in v1
    }
    const init = lowerValueIr(args[0], facts);
    return init === null ? null : { op: 'store', local, init, deep: true };
  }
  if (facts.isHook(callee, QwikHooks.UseConstant)) {
    const init = lowerSingleArg(args, facts);
    return init === undefined || init === null ? null : { op: 'const', local, init };
  }
  if (facts.isHook(callee, QwikHooks.UseId)) {
    return args.length === 0 ? { op: 'use-id', local } : null;
  }
  if (facts.isHook(callee, QwikHooks.UseContext)) {
    const context = contextBinding(args, facts);
    return context === null || args.length !== 1 ? null : { op: 'context-read', local, context };
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
    return { op: 'server-data', local, key, fallback };
  }
  return null;
}

function lowerProviderCall(call: AstNode, facts: SetupLowerFacts): SetupOp | null {
  const { callee, arguments: args } = call as { callee: unknown; arguments: unknown[] };
  if (!facts.isHook(callee, QwikHooks.UseContextProvider) || args.length !== 2) {
    return null;
  }
  const context = contextBinding(args, facts);
  const value = context === null ? null : lowerValueIr(args[1], facts);
  return context === null || value === null ? null : { op: 'context-provider', context, value };
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
