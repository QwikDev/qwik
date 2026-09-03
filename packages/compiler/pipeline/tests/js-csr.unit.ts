import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { childPathExpression, generateJsCsr } from '../generate/js-csr';
import { linkPlans } from '../link/link-plans';
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
  expect(output.modules[0].code).toContain('createTemplate("before")');
  expect(output.modules[0].code).toContain('_createElementTemplate("<span></span>")');
  expect(output.modules[0].code).toContain('return [el0, el1];');
});
