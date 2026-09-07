import { describe, expect, test } from 'vitest';
import { runInNewContext } from 'node:vm';
import { analyseModule } from '../analyse/analyse-module';
import { parseModule } from '../analyse/ast/parse';
import { childPathExpression, generateJsCsr } from '../generate/js-csr';
import { linkPlans } from '../link/link-plans';
import { transformModules } from '../compat/transform-modules';
import {
  BuildMode,
  Environment,
  EntryKind,
  LinkResultKind,
  OpKind,
  ProgramBodyKind,
} from '../schema';

describe('childPathExpression', () => {
  function path(index: number, nodeCount: number): { code: string; imports: string[] } {
    const imports = new Set<string>();
    const code = childPathExpression('el0', index, nodeCount, imports);
    return { code, imports: [...imports] };
  }

  test('index 0 is a bare first-child lookup', () => {
    expect(path(0, 1)).toEqual({ code: '_first(el0)', imports: ['_first'] });
  });

  test('a front-walk tie prefers the front (the only shape the oracle emits)', () => {
    expect(path(1, 3).code).toBe('_next(_first(el0))');
  });

  test('a strictly shorter back walk uses last/prev', () => {
    expect(path(3, 4)).toEqual({ code: '_last(el0)', imports: ['_last'] });
    expect(path(2, 4).code).toBe('_prev(_last(el0))');
    expect(path(2, 5).code).toBe('_next(_next(_first(el0)))');
    expect(path(3, 5).code).toBe('_prev(_last(el0))');
    expect(path(4, 6).code).toBe('_prev(_last(el0))');
  });
});

test('emits mixed multi-root programs as an array', async () => {
  const path = 'src/component.tsx';
  const analysed = await analyseModule({ path, code: 'export default () => <p />;' }, {});
  const linked = linkPlans(
    [analysed],
    [{ kind: EntryKind.Module, module: path }],
    { environment: Environment.Browser, mode: BuildMode.Prod, stripExports: [] },
    { edges: {} },
    { claims: [], policies: [], emissions: [] },
    false
  );
  if (linked.kind === LinkResultKind.Failed) {
    throw new Error('expected the fixture to link');
  }
  linked.plan.modules[0].programs[0].body = {
    kind: ProgramBodyKind.Ops,
    ops: [
      { op: OpKind.Static, html: 'before' },
      {
        op: OpKind.Element,
        tag: 'span',
        void: false,
        styleScopedId: null,
        runtimeScope: false,
        props: [],
        propsEffect: null,
        children: [],
      },
    ],
  };

  const output = await generateJsCsr(linked.plan, {});
  expect(output.modules[0].code).toContain('createTemplate("before<span></span>")');
  expect(output.modules[0].code).toContain('return [...fragment0.childNodes];');
});

test('collection setup restores outer captures before evaluating local consts', async () => {
  const output = await transformModules({
    srcDir: 'src',
    isServer: false,
    transpileTs: true,
    input: [
      {
        path: 'src/component.tsx',
        code: `import { useSignal } from '@qwik.dev/core';
export default () => {
  const suffix = useSignal('!');
  const items = useSignal(['title']);
  return <ul>{items.value.map((item) => {
    const title = item + suffix.value;
    return <li>{title + title}</li>;
  })}</ul>;
};`,
      },
    ],
  });
  const row = output.modules.find((module) => module.segment?.ctxName === 'for:render')!;
  expect(row.code).toContain('const [suffix] = _captures;');
  expect(row.code.indexOf('const [suffix]')).toBeLessThan(row.code.indexOf('const title'));
  expect(output.modules[0].code).toContain(`_withCaptures(${row.segment!.name}, [suffix])`);

  const declaration = parseModule(row.path, row.code).program.body.find(
    (statement) => statement.type === 'ExportNamedDeclaration'
  )?.declaration;
  if (declaration?.type !== 'VariableDeclaration') {
    throw new Error('expected a row function');
  }
  const renderer = declaration.declarations[0].init!;
  const text = output.modules.find((module) => module.segment?.ctxName === 'text')!;
  let reads = 0;
  const effects: (() => string)[] = [];
  const dependencies = {
    _captures: [
      {
        get value() {
          reads++;
          return '!';
        },
      },
    ],
    [`${row.segment!.name}_tmpl0`]: () => ({}),
    _first: () => ({}),
    createTextExpressionEffect: (
      _target: unknown,
      captures: string[],
      render: (...args: string[]) => string
    ) => {
      const effect = () => render(...captures);
      effects.push(effect);
      return effect;
    },
    [text.segment!.name]: (title: string) => title + title,
  };
  const render = runInNewContext(`(${row.code.slice(renderer.start, renderer.end)})`, dependencies);
  const ctx = {
    document: {},
    scheduler: { notify() {} },
  };
  expect(reads).toBe(0);
  expect(render(ctx, 'Title')).toEqual({});
  expect(reads).toBe(1);
  expect(effects).toHaveLength(1);
  expect(effects[0]()).toBe('Title!Title!');
  expect(effects[0]()).toBe('Title!Title!');
  expect(reads).toBe(1);
  render(ctx, 'Next');
  expect(reads).toBe(2);
  expect(effects[1]()).toBe('Next!Next!');
});
