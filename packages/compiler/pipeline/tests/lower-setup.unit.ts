import { describe, expect, test } from 'vitest';
import { ArgKind, CaptureAccess, BindTargetKind, ExprKind, InvokeKind, SetupKind } from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { parseModule } from '../analyse/ast/parse';
import { LocalKind, lowerSetup } from '../analyse/lower-setup';
import { createTestLowerContext } from './fixtures';

function lower(statement: string, coreBindings: [string, string][] = [['useSignal', 'useSignal']]) {
  const imports = coreBindings
    .map(([local, imported]) => `${imported}${local === imported ? '' : ` as ${local}`}`)
    .join(', ');
  const source = `${imports === '' ? '' : `import { ${imports} } from '@qwik.dev/core';`} ${statement}`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const { bindings, ctx } = createTestLowerContext(parsed.program, source);
  const imported = new Map<number, string>();
  if (imports !== '') {
    const declaration = parsed.program.body[0];
    if (declaration.type !== 'ImportDeclaration') {
      throw new Error('expected an import');
    }
    for (const specifier of declaration.specifiers) {
      if (specifier.type === 'ImportSpecifier' && specifier.imported.type === 'Identifier') {
        imported.set(bindings.declaration(specifier.local)!, specifier.imported.name);
      }
    }
  }
  const statements = parsed.program.body.filter((node) => node.type !== 'ImportDeclaration');
  ctx.coreBindings = imported;
  const count = ctx.plan.bindings.find((binding) => binding.name === 'count')!.id;
  return { ...lowerSetup(statements, ctx), ctx, count };
}

describe('lowerSetup / useSignal', () => {
  test('a literal initial lowers to an Invoke row with Lit IR', () => {
    const { setup, count } = lower('const count = useSignal(0);');
    expect(setup).toEqual([
      {
        s: SetupKind.Invoke,
        invoke: {
          op: InvokeKind.UseSignal,
          result: { bind: BindTargetKind.Pattern, pattern: 0, bindings: [count] },
          initial: {
            a: ArgKind.Expr,
            expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.Lit, value: 0 } },
          },
        },
      },
    ]);
  });

  test('registers a kinded Signal local at slot 0', () => {
    const { locals, count } = lower('const count = useSignal(0);');
    expect(locals.get(count)).toEqual({
      kind: LocalKind.Signal,
      access: CaptureAccess.Direct,
      slot: 0,
      binding: count,
    });
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
    expect(ctx.plan.source.code.slice(start, end)).toBe('compute()');
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
    expect(aliased.locals.get(aliased.count)?.kind).toBe(LocalKind.Signal);
    expect(() => lower('const count = useSignal(0);', [])).toThrow('the setup call "useSignal"');
  });

  test('non-const and non-call setup statements throw', () => {
    expect(() => lower('let count = useSignal(0);')).toThrow(
      'a setup statement that is not a const declaration'
    );
    expect(() => lower('const count = 1;')).toThrow('a setup declaration that is not a hook call');
  });
});
