import { describe, expect, test } from 'vitest';
import {
  ArgKind,
  CaptureAccess,
  BindTargetKind,
  ExprKind,
  SetupKind,
  CallTargetKind,
  CoreOperation,
  LinkResultKind,
} from '../schema';
import { ValueIrKind } from '../../src/expr-ir';
import { parseModule } from '../analyse/ast/parse';
import { lowerSetup } from '../analyse/lower-setup';
import { LocalKind } from '../analyse/locals';
import { createTestLowerContext, serverSpecialization } from './fixtures';
import { linkPlans } from '../link/link-plans';
import { emitJsSetup } from '../generate/emit-setup';
import { runInNewContext } from 'node:vm';
import { analyseModule } from '../index';

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
  test('a literal initial lowers to a Call row with Lit IR', () => {
    const { setup, count } = lower('const count = useSignal(0);');
    expect(setup).toEqual([
      {
        s: SetupKind.Call,
        target: { kind: CallTargetKind.Core, operation: CoreOperation.CreateSignal },
        result: { bind: BindTargetKind.Pattern, pattern: 1, bindings: [count] },
        args: [
          {
            a: ArgKind.Expr,
            expr: { kind: ExprKind.Ir, ir: { kind: ValueIrKind.Lit, value: 0 } },
          },
        ],
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
    const call = setup[0];
    if (call.s !== SetupKind.Call || call.args[0]?.a !== ArgKind.Expr) {
      throw new Error('expected a useSignal expr initial');
    }
    const expr = call.args[0].expr;
    if (expr.kind !== ExprKind.Js) {
      throw new Error('expected a Js-payload initial');
    }
    const [start, end] = ctx.plan.payloads[expr.payload].range;
    expect(ctx.plan.source.code.slice(start, end)).toBe('compute()');
  });

  test('an omitted initial leaves the argument list empty', () => {
    const { setup } = lower('const count = useSignal();');
    const call = setup[0];
    if (call.s !== SetupKind.Call) {
      throw new Error('expected a useSignal call');
    }
    expect(call.args).toEqual([]);
  });

  test('hooks are recognized by import, not by the local function name', () => {
    const aliased = lower('const count = sig(0);', [['sig', 'useSignal']]);
    expect(aliased.locals.get(aliased.count)?.kind).toBe(LocalKind.Signal);
    const ordinary = lower('const useSignal = (value) => value; const count = useSignal(0);', []);
    expect(ordinary.locals.get(ordinary.count)?.kind).toBe(LocalKind.Const);
    expect(ordinary.setup.map((entry) => entry.s)).toEqual([SetupKind.Const, SetupKind.Call]);
  });

  test('non-const statements and unsupported core calls still throw', () => {
    expect(() => lower('let count = useSignal(0);')).toThrow(
      'a setup statement that is not a const declaration'
    );
    expect(() =>
      lower('const count = component$(() => null);', [['component$', 'component$']])
    ).toThrow('the setup call "component$"');
  });
});

test('component const setup preserves order, patterns, calls and signal snapshots', () => {
  const { setup, ctx, locals, count } = lower(`
const count = props.read('initial');
const { [props.read('field')]: { label = props.read('fallback') }, ...rest } = props.read('record');
const [first, , ...tail] = props.read('array');
const format = (value) => value.toUpperCase();
const title = format(label), suffix = rest.suffix;
const signal = useSignal(count), snapshot = signal.value;
`);
  expect(locals.get(count)?.kind).toBe(LocalKind.Const);
  const linked = linkPlans(
    [ctx.plan],
    [],
    serverSpecialization(),
    { edges: {} },
    { claims: [], policies: [], emissions: [] },
    false
  );
  if (linked.kind === LinkResultKind.Failed) {
    throw new Error('expected a linked module');
  }
  const imports = new Set<string>();
  const statements = emitJsSetup(linked.plan.modules[0], { setup }, imports, (use) => use.qrl);
  expect([...imports]).toEqual(['useSignal']);
  const reads: string[] = [];
  const values: Record<string, unknown> = {
    initial: 3,
    field: 'details',
    fallback: 'default',
    record: { details: {}, suffix: '!' },
    array: [1, 2, 3, 4],
  };
  const result = runInNewContext(
    `(() => {
    ${statements.join('\n')}
    return { title, suffix, first, tail, signal, snapshot };
  })()`,
    {
      props: {
        read(name: string) {
          reads.push(name);
          return values[name];
        },
      },
      useSignal(value: unknown) {
        return { value };
      },
    }
  );
  expect(reads).toEqual(['initial', 'record', 'field', 'fallback', 'array']);
  expect(result).toEqual({
    title: 'DEFAULT',
    suffix: '!',
    first: 1,
    tail: [3, 4],
    signal: { value: 3 },
    snapshot: 3,
  });
  result.signal.value = 4;
  expect(result.snapshot).toBe(3);
});

test('component setup restores the surrounding local scope on success and failure', () => {
  for (const source of ['const count = 1;', 'const count = 1; let other = 2;']) {
    const parsed = parseModule('t.tsx', source);
    const { ctx } = createTestLowerContext(parsed.program, source);
    const outerLocals = ctx.locals;
    if (source.includes('let')) {
      expect(() => lowerSetup(parsed.program.body, ctx)).toThrow();
    } else {
      expect(lowerSetup(parsed.program.body, ctx).locals.size).toBe(1);
    }
    expect(ctx.locals).toBe(outerLocals);
    expect(ctx.locals.size).toBe(0);
  }
});

test('ordinary local calls share call plans while optional calls retain authored JS', () => {
  const { setup, locals, count } = lower(`
const callback = props.callback;
const count = callback(1, ...props.rest);
const optional = callback?.(2);
`);
  expect(setup[1]).toMatchObject({
    s: SetupKind.Call,
    args: [{ a: ArgKind.Expr }, { a: ArgKind.Spread }],
  });
  expect(locals.get(count)?.kind).toBe(LocalKind.Const);
  expect(setup[2]).toMatchObject({ s: SetupKind.Const });
});

test('signal initializers retain module references alongside local arguments', async () => {
  const plan = await analyseModule(
    {
      path: 'component.tsx',
      code: `import { useSignal } from '@qwik.dev/core';
import { initial } from './config';
export default (props) => {
  const offset = props.offset;
  const count = useSignal(initial + offset);
  return <span>{count.value}</span>;
};`,
    },
    {}
  );
  expect(plan.programs[0].setup[1]).toMatchObject({
    s: SetupKind.Call,
    target: { kind: CallTargetKind.Core, operation: CoreOperation.CreateSignal },
  });
});
