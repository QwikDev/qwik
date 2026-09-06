import { describe, expect, test } from 'vitest';
import { runInNewContext } from 'node:vm';
import {
  CaptureAccess,
  BindTargetKind,
  EachSourceKind,
  ExprKind,
  IndexMode,
  LinkResultKind,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  ResumeKind,
  RowKind,
  SetupKind,
  Shape,
  ValueKind,
} from '../schema';
import { parseModule } from '../analyse/ast/parse';
import { unwrapExpression } from '../analyse/ast/utils';
import { LocalKind } from '../analyse/lower-setup';
import { lowerJsx } from '../analyse/lower-jsx';
import { createTestLowerContext, serverSpecialization } from './fixtures';
import { linkPlans } from '../link/link-plans';
import { emitJsSetup } from '../generate/emit-setup';

function lower(jsx: string) {
  const source = `const items = null; const a = ${jsx};`;
  const parsed = parseModule('t.tsx', source);
  expect(parsed.errors).toEqual([]);
  const statement = parsed.program.body[1];
  if (statement.type !== 'VariableDeclaration') {
    throw new Error('expected a variable declaration');
  }
  const element = unwrapExpression(statement.declarations[0].init);
  if (element?.type !== 'JSXElement') {
    throw new Error('expected a JSX element');
  }
  const { ctx } = createTestLowerContext(parsed.program, source);
  const items = ctx.plan.bindings.find((binding) => binding.name === 'items')!.id;
  ctx.locals = new Map([
    [items, { kind: LocalKind.Signal, access: CaptureAccess.Direct, slot: 0, binding: items }],
  ]);
  return { op: lowerJsx(element, ctx), ctx };
}

const ROW = '<ul>{items.value.map((item) => <li key={item.id}>{item.label}</li>)}</ul>';

describe('lowerArray / reactive rows', () => {
  test.each(['items.value', '[{}]'])(
    'parameter defaults preserve evaluation order: %s',
    (source) => {
      const { ctx } = lower(
        `<ul>{${source}.map(({ [items.value.field]: label = items.value.fallback, copy = label, ...rest }) => <li>{copy}</li>)}</ul>`
      );
      const linked = linkPlans(
        [ctx.plan],
        [],
        serverSpecialization(),
        { edges: {} },
        { claims: [], policies: [], emissions: [] },
        false
      );
      if (linked.kind === LinkResultKind.Failed) {
        throw new Error('expected the fixture to link');
      }
      const module = linked.plan.modules[0];
      const program = module.programs.find((program) => program.setup.length > 0)!;
      const calls: string[] = [];
      const result = runInNewContext(
        `(() => {
      ${emitJsSetup(module, program, new Set()).join('\n')}
      return [label, copy, rest.extra];
    })()`,
        {
          item: {
            get 0() {
              calls.push('get');
              return undefined;
            },
            extra: 'rest',
          },
          items: {
            value: {
              field: 0,
              get fallback() {
                calls.push('default');
                return 'fallback';
              },
            },
          },
        }
      );
      expect(result).toEqual(['fallback', 'fallback', 'rest']);
      expect(calls).toEqual(['get', 'default']);
      const row = module.qrls.find((qrl) => qrl.ctxName === 'for:render');
      if (row !== undefined) {
        expect(row.params.used.map((binding) => module.bindings[binding].name)).toEqual(['item']);
      }
    }
  );

  test('does not turn a parameter TDZ into a successful read', () => {
    expect(() =>
      lower('<ul>{items.value.map(({ title = index }, index) => <li>{title}</li>)}</ul>')
    ).toThrow('a collection parameter referencing a later parameter');
  });

  test.each(['items.value', '[{}]'])('complex row patterns lower to const setup: %s', (source) => {
    const { ctx } = lower(
      `<ul>{${source}.map(({ id, details: { title = items.value.length }, ...rest }) => <li key={id}>{title + rest.suffix}</li>)}</ul>`
    );
    const program = ctx.plan.programs.find((program) => program.setup.length > 0)!;
    expect(program.setup[0]).toMatchObject({
      s: SetupKind.Const,
      result: { bind: BindTargetKind.Pattern },
    });
    const result = program.setup[0].s === SetupKind.Const ? program.setup[0].result : null;
    if (result?.bind !== BindTargetKind.Pattern) {
      throw new Error('expected a pattern binding');
    }
    expect(result.bindings.map((binding) => ctx.plan.bindings[binding].name)).toEqual([
      'id',
      'title',
      'rest',
    ]);
  });

  test('a derived source gets a function QRL with captures and preserves its row key', () => {
    const { op, ctx } = lower(
      '<ul>{items.value.filter((item) => item.visible).map((item, index) => <li key={item.id}>{index}:{item.label}</li>)}</ul>'
    );
    const each = op.op === OpKind.Element ? op.children[0] : null;
    expect(each).toMatchObject({
      op: OpKind.Each,
      source: {
        s: EachSourceKind.Derived,
        value: { v: ValueKind.Computed, resume: { r: ResumeKind.Qrl } },
      },
      key: { v: ValueKind.Qrl },
      index: IndexMode.Effects,
    });
    const source = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'collection:source')!;
    expect(source.payloadKind).toBe(QrlPayloadKind.Function);
    expect(
      source.captures.map((capture) => [ctx.plan.bindings[capture.binding].name, capture.access])
    ).toEqual([['items', CaptureAccess.Direct]]);
    expect(source.origin.paramRanges).toEqual([]);
  });

  test('derived sources require a row key', () => {
    expect(() =>
      lower('<ul>{items.value.filter((item) => item.visible).map((item) => <li />)}</ul>')
    ).toThrow('A derived collection requires a row key');
  });

  test.each([
    [
      '{ let label = item.label; return <li>{label}</li>; }',
      'the collection row body "BlockStatement"',
    ],
    [
      '{ if (item.enabled) return <li />; return null; }',
      'the collection row body "BlockStatement"',
    ],
    ['{ log(item); return <li />; }', 'the collection row body "BlockStatement"'],
    ['{ return; }', 'the collection row body "BlockStatement"'],
    ['{ const label = <b />; return <li>{label}</li>; }', 'JSX inside an expression value'],
    ['{ const key = item.id; return <li key={key} />; }', 'a collection key capturing "key"'],
    [
      '{ const { label = <b /> } = item; return <li>{label}</li>; }',
      'JSX inside a binding pattern',
    ],
    ['render(<li />)', 'JSX inside an expression value'],
  ])('rejects unsupported row bodies: %s', (row, error) => {
    expect(() => lower(`<ul>{items.value.map((item) => ${row})}</ul>`)).toThrow(error);
  });

  test('rejects async row setup instead of emitting await in a synchronous renderer', () => {
    expect(() =>
      lower(
        '<ul>{items.value.map(async (item) => { const label = await item.label; return <li>{label}</li>; })}</ul>'
      )
    ).toThrow('an async collection row');
  });

  test.each(['items.value', '[{}]'])(
    'destructured consts retain bindings and reads inside patterns: %s',
    (source) => {
      const { ctx } = lower(`<ul>{${source}.map(({ details, fallback }, index) => {
        const { title: label = fallback, copy = label, [index]: position = items.value.length, ...rest } = details;
        const [first = copy, , { nested }, ...tail] = rest.parts;
        return <li onClick$={() => console.log(label, first, nested, tail)}>{position}</li>;
      })}</ul>`);
      const program = ctx.plan.programs.find((program) => program.setup.length > 0)!;
      const names = (bindings: number[]) =>
        bindings.map((binding) => ctx.plan.bindings[binding].name);
      expect(
        program.setup.map((entry) => {
          if (entry.s !== SetupKind.Const || entry.result.bind !== BindTargetKind.Pattern) {
            throw new Error('expected a const binding pattern');
          }
          return names(entry.result.bindings);
        })
      ).toEqual([
        ['label', 'copy', 'position', 'rest'],
        ['first', 'nested', 'tail'],
      ]);
      const object = program.setup[0];
      if (object.s !== SetupKind.Const || object.result.bind !== BindTargetKind.Pattern) {
        throw new Error('expected an object binding pattern');
      }
      expect(
        ctx.plan.payloads[object.result.pattern].reads.map((read) => [
          ctx.plan.bindings[read.binding].name,
          read.memberPath,
        ])
      ).toEqual(
        source === 'items.value'
          ? [
              ['item', ['fallback']],
              ['index', ['value']],
            ]
          : [['item', ['fallback']]]
      );
      const event = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'onClick$')!;
      expect(names(event.captures.map((capture) => capture.binding))).toEqual([
        'label',
        'first',
        'nested',
        'tail',
      ]);
      expect(event.captures.every((capture) => capture.access === CaptureAccess.Direct)).toBe(true);
      const row = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'for:render');
      if (source === 'items.value') {
        expect(names(row!.params.used)).toEqual(['item', 'index']);
        expect(names(row!.captures.map((capture) => capture.binding))).toEqual(['items']);
      }
    }
  );

  test('a single-return block preserves row keys, parameters and captures', () => {
    const { op, ctx } = lower(
      '<ul>{items.value.map((item) => { /* row */ return (<li key={item.id}>{item.label}</li>); })}</ul>'
    );
    const concise = lower(ROW);
    expect(op).toEqual(concise.op);
    expect(ctx.plan.qrls.map((qrl) => [qrl.id, qrl.captures, qrl.params])).toEqual(
      concise.ctx.plan.qrls.map((qrl) => [qrl.id, qrl.captures, qrl.params])
    );
    const row = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'for:render')!;
    expect(ctx.plan.source.code.slice(...row.origin.bodyRange)).toBe(
      '<li key={item.id}>{item.label}</li>'
    );
  });

  test.each([undefined, null, 'Provided'])(
    'destructuring evaluates initializers, getters and defaults in authored order: %s',
    (provided) => {
      const { ctx } = lower(`<ul>{items.value.map(({ read, fallback }, index) => {
        const { title: label = fallback(), copy = label, [index]: position, ...rest } = read();
        const [first = copy, , { nested }, ...tail] = rest.values;
        const {} = rest.touch();
        return <li>{label}</li>;
      })}</ul>`);
      const linked = linkPlans(
        [ctx.plan],
        [],
        serverSpecialization(),
        { edges: {} },
        { claims: [], policies: [], emissions: [] },
        false
      );
      if (linked.kind === LinkResultKind.Failed) {
        throw new Error('expected the fixture to link');
      }
      const module = linked.plan.modules[0];
      const program = module.programs.find((program) => program.setup.length > 0)!;
      const statements = emitJsSetup(module, program, new Set());
      const calls: string[] = [];
      const result = runInNewContext(
        `(() => {
        ${statements.join('\n')}
        return { label, copy, position, first, nested, tail, extra: rest.extra };
      })()`,
        {
          index: { value: 0 },
          item: {
            read() {
              calls.push('read');
              return {
                get title() {
                  calls.push('title');
                  return provided;
                },
                0: 'Position',
                values: [undefined, 'Skip', { nested: 'Nested' }, 'Tail'],
                get extra() {
                  calls.push('extra');
                  return 'Extra';
                },
                touch() {
                  calls.push('touch');
                  return {};
                },
              };
            },
            fallback() {
              calls.push('fallback');
              return 'Default';
            },
          },
        }
      );
      const label = provided === undefined ? 'Default' : provided;
      expect(result).toEqual({
        label,
        copy: label,
        position: 'Position',
        first: label,
        nested: 'Nested',
        tail: ['Tail'],
        extra: 'Extra',
      });
      expect(calls).toEqual([
        'read',
        'title',
        ...(provided === undefined ? ['fallback'] : []),
        'extra',
        'touch',
      ]);
    }
  );

  test.each(['items.value', "[{ label: 'Row' }]"])(
    'row consts preserve setup order, captures and enclosing locals: %s',
    (source) => {
      const { ctx } = lower(`<ul>{${source}.map(({ label }, index) => {
        const title = label.toUpperCase() + items.value.length;
        const numbered = index + title, visible = numbered.length > 0;
        return visible && <li title={title} onClick$={() => console.log(numbered)}>{title}{numbered}</li>;
      })}</ul>`);
      const program = ctx.plan.programs.find((program) => program.setup.length > 0)!;
      expect(program.setup.map((entry) => entry.s)).toEqual([
        SetupKind.Const,
        SetupKind.Const,
        SetupKind.Const,
      ]);
      const row = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'for:render');
      const names = (bindings: number[]) =>
        bindings.map((binding) => ctx.plan.bindings[binding].name);
      if (source === 'items.value') {
        expect(names(row!.params.used)).toEqual(['item', 'index']);
        expect(names(row!.captures.map((capture) => capture.binding))).toEqual(['items']);
      }
      const condition = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:condition')!;
      expect(
        condition.captures.map((capture) => [
          ctx.plan.bindings[capture.binding].name,
          capture.access,
        ])
      ).toEqual([['visible', CaptureAccess.Direct]]);
      expect([...ctx.locals.keys()].map((binding) => ctx.plan.bindings[binding].name)).toEqual([
        'items',
      ]);
      expect(ctx.inlineParams).toBeNull();
    }
  );

  test.each([
    'item.enabled ? <li>{item.label}</li> : null',
    'item.enabled && <li>{item.label}</li>',
  ])('lowers a conditional row through a branch: %s', (row) => {
    const { op, ctx } = lower(`<ul>{items.value.map((item) => ${row})}</ul>`);
    const each = op.op === OpKind.Element ? op.children[0] : null;
    if (each?.op !== OpKind.Each || each.row.r !== RowKind.Chunk) {
      throw new Error('expected a chunk row');
    }
    expect(each.shape).toBe(Shape.Many);
    expect(each.key).toBeNull();
    const use = each.row.use;
    const rowQrl = ctx.plan.qrls.find((qrl) => qrl.id === use.qrl);
    if (rowQrl?.body.b !== QrlBodyKind.Program) {
      throw new Error('expected a row program');
    }
    expect(ctx.plan.programs[rowQrl.body.program].body).toMatchObject({
      kind: ProgramBodyKind.Ops,
      ops: [{ op: OpKind.Branch, else: null }],
    });
    const item = ctx.plan.bindings.find((binding) => binding.name === 'item')!.id;
    expect(rowQrl.params.used).toEqual([item]);
    expect(ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:condition')?.captures).toEqual([
      { binding: item, access: CaptureAccess.LoopValue },
    ]);
  });

  test.each(['items.value', "[{ enabled: true, label: 'Row' }]"])(
    'condition reads preserve destructured bindings and index semantics: %s',
    (source) => {
      const { ctx } = lower(
        `<ul>{${source}.map(({ enabled, label }, index) => enabled && index === 0 ? <li>{label}</li> : null)}</ul>`
      );
      const condition = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'branch:condition');
      if (condition?.body.b !== QrlBodyKind.Expr || condition.body.expr.kind !== ExprKind.Js) {
        throw new Error('expected a condition expression payload');
      }
      const reads = ctx.plan.payloads[condition.body.expr.payload].reads;
      expect(reads.map((read) => [ctx.plan.bindings[read.binding].name, read.memberPath])).toEqual(
        source === 'items.value'
          ? [
              ['item', ['enabled']],
              ['index', ['value']],
            ]
          : [['item', ['enabled']]]
      );
    }
  );

  test('a keyed map lowers to an Each op with a chunk row', () => {
    const { op } = lower(ROW);
    expect(op.op === OpKind.Element && op.children[0]).toMatchObject({
      op: OpKind.Each,
      row: { r: RowKind.Chunk },
    });
  });

  test('a row text hole records a LoopValue capture on the text qrl', () => {
    const { ctx } = lower(ROW);
    const text = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'text');
    const item = ctx.plan.bindings.find((binding) => binding.name === 'item')!.id;
    expect(text?.captures).toEqual([{ binding: item, access: CaptureAccess.LoopValue }]);
  });

  test('a literal array source lowers to an inline row with no key and no qrl', () => {
    const { op, ctx } = lower("<ul>{['first', 'second'].map(() => <li>Item</li>)}</ul>");
    const each = op.op === OpKind.Element ? op.children[0] : null;
    if (each?.op !== OpKind.Each) {
      throw new Error('expected an Each op');
    }
    expect(each.source.s).toBe(EachSourceKind.Array);
    expect(each.source.value).toMatchObject({
      v: ValueKind.Computed,
      resume: { r: ResumeKind.Inline },
    });
    expect(each.key).toBeNull();
    if (each.row.r !== RowKind.Inline) {
      throw new Error('expected an inline row');
    }
    expect(each.row.renderId).toMatch(/^semantic_collectionRender_\d+_\d+_[a-z0-9]+$/);
    // Inline rows live in the component scope — no chunkable qrl row exists for them.
    expect(ctx.plan.qrls.filter((qrl) => qrl.ctxName === 'for:render')).toEqual([]);
  });

  test('index mode derives from who captures the index', () => {
    const eachOf = (jsx: string) => {
      const { op } = lower(jsx);
      const each = op.op === OpKind.Element ? op.children[0] : null;
      if (each?.op !== OpKind.Each) {
        throw new Error('expected an Each op');
      }
      return each;
    };
    expect(eachOf(ROW).index).toBe(IndexMode.None);
    expect(
      eachOf('<ul>{items.value.map((item, i) => <li key={item.id}>{i}</li>)}</ul>').index
    ).toBe(IndexMode.Effects);
    expect(
      eachOf(
        '<ul>{items.value.map((item, i) => <li key={item.id} onClick$={() => console.log(i)}>x</li>)}</ul>'
      ).index
    ).toBe(IndexMode.Escapes);
  });

  test('destructured names in an opaque expression rewrite through payload reads', () => {
    const source =
      "<ul>{items.value.map(({ id, label }) => <li key={id}>{label + '!' + id}</li>)}</ul>";
    const { ctx } = lower(source);
    const text = ctx.plan.qrls.find((qrl) => qrl.ctxName === 'text');
    if (text?.body.b !== QrlBodyKind.Expr || text.body.expr.kind !== ExprKind.Js) {
      throw new Error('expected a Js-payload text segment');
    }
    // one container capture despite two aliases
    expect(text.captures).toHaveLength(1);
    const payload = ctx.plan.payloads[text.body.expr.payload];
    expect(payload.reads).toEqual([
      {
        range: expect.anything(),
        binding: text.captures[0].binding,
        role: 'read',
        memberPath: ['label'],
      },
      {
        range: expect.anything(),
        binding: text.captures[0].binding,
        role: 'read',
        memberPath: ['id'],
      },
    ]);
  });

  test('inline rows interpolate lexical params; reactive reads become capturing holes', () => {
    const inline = lower("<ul>{['a'].map((item, index) => <li>{index}</li>)}</ul>");
    const hole = (() => {
      const each = inline.op.op === OpKind.Element ? inline.op.children[0] : null;
      if (each?.op !== OpKind.Each || each.row.r !== RowKind.Inline) {
        throw new Error('expected an inline Each');
      }
      const body = inline.ctx.plan.programs[each.row.program].body;
      if (body.kind !== ProgramBodyKind.Ops || body.ops[0].op !== OpKind.Element) {
        throw new Error('expected an element row');
      }
      return body.ops[0].children[0];
    })();
    expect(hole).toMatchObject({
      op: OpKind.Hole,
      value: { v: ValueKind.Computed, resume: { r: ResumeKind.Inline } },
    });
    expect(inline.ctx.plan.qrls).toEqual([]);
    const reactive = lower("<ul>{['a'].map((item) => <li>{item + items.value.length}</li>)}</ul>");
    expect(reactive.ctx.plan.qrls).toHaveLength(1);
    expect(reactive.ctx.plan.qrls[0].captures).toEqual([
      { binding: expect.any(Number), access: CaptureAccess.LoopValue },
      { binding: expect.any(Number), access: CaptureAccess.Direct },
    ]);
  });

  test('the loop param stays out of scope after the row', () => {
    const { ctx } = lower(ROW);
    const item = ctx.plan.bindings.find((binding) => binding.name === 'item')!.id;
    expect(ctx.locals.has(item)).toBe(false);
  });
});
