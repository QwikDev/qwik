import { getIdentifierName, getRange, unwrapExpression } from './ast-utils';
import type { ValueIR, ValueIrBinOp, ValueIrLogicOp, ValueIrUnaryOp } from './expr-ir';
import type { BindingId, SourceRange } from './plan-types';
import type { AstNode } from './types';

/**
 * Lowers an expression AST into `ValueIR` (specs/02-expression-ir.md), or returns null when any
 * part is outside the portable subset — the caller keeps the source-range path in that case. Never
 * guesses: unsupported constructs (calls, lambdas, assignments, regex, spreads, unknown globals)
 * fail the whole expression.
 */
export interface ExprLowerFacts {
  bindingIdAt(range: SourceRange | null): BindingId | null;
  /** Proven signal-valued binding (`sourceOutputs`) — enables the `signal-read` fast path. */
  isSourceBinding(binding: BindingId): boolean;
  /** Function-valued bindings read as values are call-shaped territory — not lowerable yet. */
  isFunctionBinding(binding: BindingId): boolean;
}

export interface ValueIrCoverage {
  total: number;
  lowered: number;
}

let activeCoverage: ValueIrCoverage | null = null;

/** Test-only coverage tap: counts expression sites lowered vs total until `stop`. */
export function startValueIrCoverage(): ValueIrCoverage {
  const coverage: ValueIrCoverage = { total: 0, lowered: 0 };
  activeCoverage = coverage;
  return coverage;
}

export function stopValueIrCoverage(): void {
  activeCoverage = null;
}

export function reportValueIrSite(lowered: boolean): void {
  if (activeCoverage === null) {
    return;
  }
  activeCoverage.total++;
  if (lowered) {
    activeCoverage.lowered++;
  }
}

const UNARY_OPS: ReadonlySet<string> = new Set([
  '!',
  '-',
  '+',
  'typeof',
] satisfies ValueIrUnaryOp[]);
const BIN_OPS: ReadonlySet<string> = new Set([
  '===',
  '!==',
  '==',
  '!=',
  '<',
  '<=',
  '>',
  '>=',
  '+',
  '-',
  '*',
  '/',
  '%',
  '**',
] satisfies ValueIrBinOp[]);
const LOGIC_OPS: ReadonlySet<string> = new Set(['&&', '||', '??'] satisfies ValueIrLogicOp[]);

export function lowerValueIr(expression: unknown, facts: ExprLowerFacts): ValueIR | null {
  const node = unwrapExpression(expression);
  if (node === null || node === undefined) {
    return null;
  }
  switch (node.type) {
    case 'Literal': {
      if ((node as { regex?: unknown }).regex !== undefined) {
        return null;
      }
      const value = (node as { value: unknown }).value;
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return { k: 'lit', v: value };
      }
      return null; // bigint literals stay unsupported for now
    }
    case 'Identifier': {
      const binding = facts.bindingIdAt(getRange(node));
      if (binding === null) {
        return getIdentifierName(node) === 'undefined' ? { k: 'undef' } : null;
      }
      if (facts.isFunctionBinding(binding)) {
        return null;
      }
      return { k: 'binding-read', binding };
    }
    case 'ChainExpression':
      return lowerValueIr((node as { expression: unknown }).expression, facts);
    case 'MemberExpression': {
      const member = node as {
        object: unknown;
        property: unknown;
        computed: boolean;
        optional?: boolean;
      };
      if (!member.computed && getIdentifierName(member.property) === 'value') {
        const object = unwrapExpression(member.object);
        const binding = object?.type === 'Identifier' ? facts.bindingIdAt(getRange(object)) : null;
        if (binding !== null && facts.isSourceBinding(binding)) {
          return { k: 'signal-read', binding };
        }
      }
      const obj = lowerValueIr(member.object, facts);
      if (obj === null) {
        return null;
      }
      if (member.computed) {
        const key = lowerValueIr(member.property, facts);
        return key === null
          ? null
          : { k: 'index', obj, key, ...(member.optional === true ? { optional: true } : {}) };
      }
      const name = getIdentifierName(member.property);
      return name === null
        ? null
        : { k: 'member', obj, name, ...(member.optional === true ? { optional: true } : {}) };
    }
    case 'UnaryExpression': {
      const unary = node as { operator: string; argument: unknown };
      if (!UNARY_OPS.has(unary.operator)) {
        return null;
      }
      const a = lowerValueIr(unary.argument, facts);
      return a === null ? null : { k: 'unary', op: unary.operator as ValueIrUnaryOp, a };
    }
    case 'BinaryExpression': {
      const binary = node as { operator: string; left: unknown; right: unknown };
      if (!BIN_OPS.has(binary.operator)) {
        return null;
      }
      const a = lowerValueIr(binary.left, facts);
      const b = a === null ? null : lowerValueIr(binary.right, facts);
      return b === null || a === null
        ? null
        : { k: 'bin', op: binary.operator as ValueIrBinOp, a, b };
    }
    case 'LogicalExpression': {
      const logical = node as { operator: string; left: unknown; right: unknown };
      if (!LOGIC_OPS.has(logical.operator)) {
        return null;
      }
      const a = lowerValueIr(logical.left, facts);
      const b = a === null ? null : lowerValueIr(logical.right, facts);
      return b === null || a === null
        ? null
        : { k: 'logic', op: logical.operator as ValueIrLogicOp, a, b };
    }
    case 'ConditionalExpression': {
      const conditional = node as { test: unknown; consequent: unknown; alternate: unknown };
      const test = lowerValueIr(conditional.test, facts);
      const then = test === null ? null : lowerValueIr(conditional.consequent, facts);
      const alternate = then === null ? null : lowerValueIr(conditional.alternate, facts);
      return test === null || then === null || alternate === null
        ? null
        : { k: 'cond', test, then, else: alternate };
    }
    case 'TemplateLiteral': {
      const template = node as {
        quasis: { value: { cooked?: string | null } }[];
        expressions: unknown[];
      };
      const parts: (string | ValueIR)[] = [];
      for (let i = 0; i < template.quasis.length; i++) {
        const cooked = template.quasis[i].value.cooked;
        if (cooked === undefined || cooked === null) {
          return null;
        }
        if (cooked !== '') {
          parts.push(cooked);
        }
        if (i < template.expressions.length) {
          const part = lowerValueIr(template.expressions[i], facts);
          if (part === null) {
            return null;
          }
          parts.push(part);
        }
      }
      return { k: 'template', parts };
    }
    case 'ArrayExpression': {
      const items: ValueIR[] = [];
      for (const element of (node as { elements: unknown[] }).elements) {
        if (element === null) {
          return null; // holes
        }
        if ((element as AstNode).type === 'SpreadElement') {
          return null;
        }
        const item = lowerValueIr(element, facts);
        if (item === null) {
          return null;
        }
        items.push(item);
      }
      return { k: 'array', items };
    }
    case 'ObjectExpression': {
      const entries: (readonly [string, ValueIR])[] = [];
      for (const property of (node as { properties: unknown[] }).properties) {
        const prop = property as {
          type: string;
          kind?: string;
          computed?: boolean;
          method?: boolean;
          key?: unknown;
          value?: unknown;
        };
        if (prop.type !== 'Property' || prop.kind !== 'init' || prop.computed || prop.method) {
          return null;
        }
        const key = objectKeyName(prop.key);
        const value = key === null ? null : lowerValueIr(prop.value, facts);
        if (key === null || value === null) {
          return null;
        }
        entries.push([key, value]);
      }
      return { k: 'object', entries };
    }
    default:
      return null;
  }
}

function objectKeyName(key: unknown): string | null {
  const node = key as AstNode | undefined;
  if (node === undefined) {
    return null;
  }
  const identifier = getIdentifierName(node);
  if (identifier !== null) {
    return identifier;
  }
  if (node.type === 'Literal') {
    const value = (node as { value: unknown }).value;
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
  }
  return null;
}
