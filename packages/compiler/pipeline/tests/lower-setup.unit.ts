import { describe, expect, test } from 'vitest';
import {
  ArgKind,
  BindTargetKind,
  BindingScope,
  ExprKind,
  InvokeKind,
  SetupKind,
  VarKind,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import type { AstNode } from '../analyse/ast/ast-types';
import { parseModule } from '../analyse/ast/parse';
import { createLowerContext } from '../analyse/lower-context';
import { LocalKind, lowerSetup } from '../analyse/lower-setup';
import { emptyModulePlan } from './fixtures';

function lower(statement: string, coreBindings: [string, string][] = [['useSignal', 'useSignal']]) {
  const parsed = parseModule('t.tsx', statement);
  expect(parsed.errors).toEqual([]);
  const plan = emptyModulePlan('t.tsx', statement);
  plan.bindings.push({
    id: 0,
    name: 'count',
    scope: BindingScope.Local,
    varKind: VarKind.Const,
    declarationRange: null,
  });
  const ctx = createLowerContext(plan, 't.tsx', undefined, new Map(coreBindings));
  return { ...lowerSetup(parsed.program.body as AstNode[], ctx), ctx };
}

describe('lowerSetup / useSignal', () => {
  test('a literal initial lowers to an Invoke row with Lit IR', () => {
    const { setup } = lower('const count = useSignal(0);');
    expect(setup).toEqual([
      {
        s: SetupKind.Invoke,
        invoke: {
          op: InvokeKind.UseSignal,
          result: { bind: BindTargetKind.Pattern, pattern: 0, bindings: [0] },
          initial: {
            a: ArgKind.Expr,
            expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.Lit, value: 0 } },
          },
        },
      },
    ]);
  });

  test('registers a kinded Signal local at slot 0', () => {
    const { locals } = lower('const count = useSignal(0);');
    expect(locals.get('count')).toEqual({ kind: LocalKind.Signal, slot: 0, binding: 0 });
  });

  test('a non-literal initial falls back to a Js payload of its source range', () => {
    const source = 'const count = useSignal(compute());';
    const { setup, ctx } = lower(source);
    const invoke = setup[0].s === SetupKind.Invoke ? setup[0].invoke : null;
    if (invoke?.op !== InvokeKind.UseSignal || invoke.initial?.a !== ArgKind.Expr) {
      throw new Error('expected a useSignal expr initial');
    }
    const expr = invoke.initial.expr;
    if (expr.kind !== ExprKind.Js) {
      throw new Error('expected a Js-payload initial');
    }
    const [start, end] = ctx.plan.payloads[expr.payload].range;
    expect(source.slice(start, end)).toBe('compute()');
  });

  test('an omitted initial omits the field', () => {
    const { setup } = lower('const count = useSignal();');
    const invoke = setup[0].s === SetupKind.Invoke ? setup[0].invoke : null;
    if (invoke?.op !== InvokeKind.UseSignal) {
      throw new Error('expected a useSignal invoke');
    }
    expect(invoke.initial).toBeUndefined();
  });

  test('hooks are recognized by import: an alias works, an imposter throws', () => {
    const aliased = lower('const count = sig(0);', [['sig', 'useSignal']]);
    expect(aliased.locals.get('count')?.kind).toBe(LocalKind.Signal);
    expect(() => lower('const count = useSignal(0);', [])).toThrow('the setup call "useSignal"');
  });

  test('non-const and non-call setup statements throw', () => {
    expect(() => lower('let count = useSignal(0);')).toThrow(
      'a setup statement that is not a const declaration'
    );
    expect(() => lower('const count = 1;')).toThrow('a setup declaration that is not a hook call');
  });
});
