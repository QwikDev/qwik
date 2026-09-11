import { describe, expect, test } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans, ResolutionKind, SideEffects } from '../link/link-plans';
import { EntryKind, Environment, LinkResultKind, OpKind, ProgramBodyKind, Shape } from '../schema';
import { deepFreeze, serverSpecialization } from './fixtures';
import { generateJsCsr, generateJsSsr, transformModules } from '../index';

async function link(source: string, library?: string | { path: string; code: string }[]) {
  const plans = await Promise.all(
    [
      { path: 'app.tsx', code: source },
      ...(typeof library === 'string' ? [{ path: 'lib.tsx', code: library }] : (library ?? [])),
    ].map((input) => analyseModule(input, { transpileTs: true }))
  );
  const result = linkPlans(
    deepFreeze(JSON.parse(JSON.stringify(plans))),
    [{ kind: EntryKind.Export, module: 'app.tsx', export: 'default' }],
    serverSpecialization(),
    {
      edges: Object.fromEntries(
        plans.map((plan) => [
          plan.path,
          Object.fromEntries(
            plan.edges.map((edge) => [
              edge.id,
              plans.some((target) => target.path === `${edge.specifier.replace('./', '')}.tsx`)
                ? {
                    r: ResolutionKind.Resolved,
                    path: `${edge.specifier.replace('./', '')}.tsx`,
                    sideEffects: SideEffects.Free,
                  }
                : { r: ResolutionKind.External },
            ])
          ),
        ])
      ),
    },
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(result.kind, JSON.stringify(result)).toBe(LinkResultKind.Linked);
  if (result.kind !== LinkResultKind.Linked) {
    throw new Error(JSON.stringify(result));
  }
  return result.plan;
}

function holes(plan: Awaited<ReturnType<typeof link>>) {
  return plan.modules.flatMap((module) =>
    module.programs.flatMap((program) => {
      if (program.body.kind !== ProgramBodyKind.Ops) {
        return [];
      }
      const visit = (ops: typeof program.body.ops): Shape[] =>
        ops.flatMap((op): Shape[] =>
          op.op === OpKind.Element
            ? visit(op.children)
            : op.op === OpKind.Hole
              ? [op.shape]
              : op.op === OpKind.Content && op.shape !== undefined
                ? [op.shape]
                : []
        );
      return visit(program.body.ops);
    })
  );
}

describe('linked render results', () => {
  test.each([
    ['export default (props: { title: string }) => <p>{props.title}</p>;', [Shape.Text]],
    ['export default ({ title }: { title: string }) => <p>{title}</p>;', [Shape.Text]],
    ['export default (props: { title?: string }) => <p>{props.title}</p>;', [Shape.Text]],
    [
      'export default (props: { items: { title: string }[] }) => <ul>{props.items.map((item, index) => <li key={index}>{item.title}</li>)}</ul>;',
      [Shape.Text],
    ],
    [
      'export default () => { const state: { value: number } = external(); return <p>{state.value}</p>; };',
      [Shape.Text],
    ],
    [
      'export default (props: { value: string | string[] }) => <p>{props.value}</p>;',
      [Shape.Unknown],
    ],
    ['export default (props: { value: unknown }) => <p>{props.value}</p>;', [Shape.Unknown]],
  ])('uses declared value contracts for unresolved inputs: %s', async (source, expected) => {
    expect(holes(await link(source))).toEqual(expected);
  });

  test('keeps declared contracts scoped after TypeScript normalization', async () => {
    const plan = await link(`
      const Label = ({ value }: { value: string }) => <p>{value}</p>;
      export default ({ value }: { value: unknown }) => <><Label value={external()} /><p>{value}</p></>;
    `);
    expect(holes(plan)).toEqual([Shape.Text, Shape.Unknown]);
  });

  test.each(['function', 'prop'])(
    'preserves declared library %s contracts through neutral plan serialization',
    async (contract) => {
      const plan = await link(
        `import { Label, read } from './lib'; export default () => <Label value={read()} />;`,
        `export function read()${contract === 'function' ? ': string' : ''} { return external(); }
       export const Label = (props${contract === 'prop' ? ': {value: string}' : ''}) => <p>{props.value}</p>;`
      );
      expect(holes(plan)).toEqual([Shape.Text]);
    }
  );

  test.each([
    'type Input = {value: string};',
    'interface Input {value: string}',
    'type Text = string; type Input = {value: Text};',
    'interface Base {value: string} interface Input extends Base {other?: number}',
    'interface Box<T = string> {value: T} type Input = Box;',
    'type Box<T> = {value: T}; type Input = Box<string>;',
    'type Input = {other: number} & {value: string};',
    'type Input = Pick<{value: string; other: unknown}, "value">;',
    'type Input = Readonly<Partial<{value: string}>>;',
    'type Input = {[K in "value"]: string};',
    'type Select<T> = T extends number ? string : unknown; type Input = {value: Select<1>};',
    'type Input = {value: string & {readonly __brand: "text"}};',
    'type Values = ReadonlyArray<string>; type Input = {value: Values[number]};',
    'interface Input {value: string} interface Input {other: number}',
    'interface Recursive {value: string; next?: Recursive} type Input = Recursive;',
  ])('resolves equivalent named contracts: %s', async (declaration) => {
    const plan = await link(`${declaration}
      export default (props: Input) => <p>{props.value}</p>;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('uses generic constraints without inferring from initializers', async () => {
    const plan = await link(
      `export default <T extends string,>(props: {value: T}) => <p>{props.value}</p>;`
    );
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('resolves scoped aliases independently of value bindings', async () => {
    const plan = await link(`type Input = {value: unknown}; const Input = 0;
      function Label(props: Input) { return <p>{props.value}</p>; }
      export default () => {
        type Input = {value: string};
        const Inner = (props: Input) => <p>{props.value}</p>;
        return <><Label value={external()} /><Inner value={external()} /></>;
      };`);
    expect(holes(plan)).toEqual([Shape.Unknown, Shape.Text]);
  });

  test.each([
    'import type { Input } from "./lib";',
    'import type * as Types from "./lib"; type Input = Types.Input;',
  ])('resolves imported contracts through reexports: %s', async (imported) => {
    const plan = await link(`${imported} export default (props: Input) => <p>{props.value}</p>;`, [
      { path: 'lib.tsx', code: 'export type { Box as Input } from "./definition";' },
      { path: 'definition.tsx', code: 'export interface Box<T = string> {value: T}' },
    ]);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test.each(['unknown', 'any', 'Missing', 'string | string[]'])(
    'keeps unresolved or dynamic contracts conservative: %s',
    async (value) => {
      const plan = await link(`type Input = {value: ${value}};
        export default (props: Input) => <p>{props.value}</p>;`);
      expect(holes(plan)).toEqual([Shape.Unknown]);
    }
  );

  test('keeps known JSX callers even when a declaration claims text', async () => {
    const plan = await link(`const Label = (props: {value: string}) => <p>{props.value}</p>;
      export default () => <Label value={<b />} />;`);
    expect(holes(plan)).toEqual([Shape.Element]);
  });

  test('discovers explicitly marked components returning only a prop', async () => {
    const plan = await link(`import { component$ } from '@qwik.dev/core';
      const Content = component$(props => props.value);
      export default () => <Content value={external()} />;`);
    expect(plan.modules[0].qrls.some((qrl) => qrl.declaration?.name === 'Content')).toBe(true);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('emits proven text at the component root without dynamic content', async () => {
    const plan = await link(`import { component$ } from '@qwik.dev/core';
      const Content = component$(props => props.value);
      export default () => <Content value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
    for (const generate of [generateJsSsr, generateJsCsr]) {
      const output = await generate(
        {
          ...plan,
          specialization: {
            ...plan.specialization,
            environment: generate === generateJsSsr ? Environment.Server : Environment.Browser,
          },
        },
        { rootDir: '.', outputSourceMaps: false }
      );
      const code = output.modules.map((module) => module.code).join('\n');
      expect(code).not.toMatch(/createContentBlock|renderSsrContent/);
      expect(code).toMatch(/createText|renderSsrText/);
    }
  });
  test('resolves library props from application calls after serialization', async () => {
    const plan = await link(
      `import { Label } from './lib'; export default () => <Label value="text" />;`,
      `export const Label = props => <p>{props.value}</p>;`
    );
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('resolves a component binding alias', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      const Alias = Label; export default () => <Alias value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('resolves props across reexports and import aliases', async () => {
    const plan = await link(
      `import { Caption as Label } from './lib';
      export default () => <Label value="text" />;`,
      [
        { path: 'lib.tsx', code: `export { Label as Caption } from './definition';` },
        { path: 'definition.tsx', code: 'export const Label = props => <p>{props.value}</p>;' },
      ]
    );
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('resolves props of a component declared inside its caller', async () => {
    const plan = await link(`export default () => {
      function Label(props) { return <p>{props.value}</p>; }
      return <Label value="text" />;
    };`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('ignores calls in unreachable components', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      const Unused = () => <Label value={external()} />;
      export default () => <Label value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('preserves known fields after an unknown spread overwrites a different field', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      export default () => <Label value="first" {...{other: external()}} />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('keeps an unknown last spread unknown', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      export default () => <Label value="first" {...external()} />;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('links supplied modules through the transform compatibility entry', async () => {
    const output = await transformModules({
      isServer: false,
      input: [
        {
          path: 'src/app.tsx',
          code: `import { Label } from './label'; export default () => <Label value="text" />;`,
        },
        { path: 'src/label.tsx', code: 'export const Label = props => <p>{props.value}</p>;' },
      ],
    });
    expect(output.modules.map((module) => module.code).join('\n')).not.toContain(
      'createContentBlock'
    );
  });

  test.each([
    ['<b />', Shape.Element],
    ['["text", <b />]', Shape.Many],
    ['external()', Shape.Unknown],
  ])('resolves %s passed to a local component', async (value, shape) => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      export default () => <Label value={${value}} />;`);
    expect(holes(plan)).toEqual([shape]);
  });

  test('unions all calls instead of choosing the first', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      export default () => <><Label value="text" /><Label value={<b />} /></>;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('propagates forwarding, defaults and rest spreads', async () => {
    const plan = await link(`const Label = ({value = 'default'}) => <p>{value}</p>;
      const Forward = ({ignored, ...rest}) => <Label {...rest} />;
      export default () => <Forward ignored={external()} value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('respects spread overwrite order without poisoning unrelated fields', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      export default () => <Label {...external()} value="text" other={external()} />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('resolves fields of an object passed to a known component', async () => {
    const plan = await link(`const Label = props => <p>{props.record.title}</p>;
      export default () => { const record = { title: 'text' }; return <Label record={record} />; };`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test.each([
    ['const read = record => record.title;', 'read(record)', Shape.Text],
    [
      'const change = record => { record.title = external(); }; change(record);',
      'record.title',
      Shape.Unknown,
    ],
    [
      'const change = record => { record.other = external(); }; change(record);',
      'record.title',
      Shape.Text,
    ],
  ])('tracks which fields a function consumer can mutate: %s', async (setup, expression, shape) => {
    const plan = await link(`export default () => { const record = {title: 'text'};
      ${setup} return <p>{${expression}}</p>; };`);
    expect(holes(plan)).toEqual([shape]);
  });

  test('includes mutations through a component prop', async () => {
    const plan = await link(`const Label = props => {
      props.record.title = external(); return <p>{props.record.title}</p>;
    }; export default () => { const record = { title: 'text' }; return <Label record={record} />; };`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('leaves external entry props unknown', async () => {
    expect(holes(await link(`export default props => <p>{props.value}</p>;`))).toEqual([
      Shape.Unknown,
    ]);
  });

  test.each(['`${props.value}`', 'String(props.value)', "'' + props.value"])(
    'preserves explicit string conversion: %s',
    async (expression) => {
      expect(holes(await link(`export default props => <p>{${expression}}</p>;`))).toEqual([
        Shape.Text,
      ]);
    }
  );

  test('includes later signal writes', async () => {
    const plan = await link(`import { useSignal } from '@qwik.dev/core';
      export default () => { const value = useSignal('text');
        const change = () => { value.value = external(); };
        return <p>{value.value}</p>; };`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('includes the initial value of an async computed', async () => {
    const plan = await link(`import { useComputed$ } from '@qwik.dev/core';
      export default props => { const value = useComputed$(async () => 'text', { initial: props.value });
        return <p>{value.value}</p>; };`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('preserves function values stored in signals', async () => {
    const plan = await link(`import { useSignal } from '@qwik.dev/core';
      export default () => { const value = useSignal(() => 'text'); return <p>{value.value}</p>; };`);
    expect(holes(plan)).toEqual([Shape.Element]);
  });

  test.each([
    `const alias = value; alias.value = external();`,
    `const { value: items } = value; items.push(<b />);`,
    `value.value ||= external();`,
  ])('includes mutations through aliases and methods: %s', async (mutation) => {
    const plan = await link(`import { useSignal } from '@qwik.dev/core';
      export default () => { const value = useSignal(['text']);
        const change = () => { ${mutation} };
        return <p>{value.value[0]}</p>; };`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('includes writes through component parameter aliases', async () => {
    const plan = await link(`const Label = ({record}) => {
      const change = () => { record.value = external(); };
      return <p>{record.value}</p>;
    }; export default () => <Label record={{value: 'text'}} />;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('resolves imported ordinary bindings', async () => {
    const plan = await link(
      `import { title, getTitle } from './lib';
      export default () => <p>{title}{getTitle()}</p>;`,
      `export const title = 'text'; export function getTitle() { return title; }`
    );
    expect(holes(plan)).toEqual([Shape.Text, Shape.Text]);
  });

  test('finds function calls in event statements', async () => {
    const plan = await link(`export default () => <button onClick$={() => {
      const native = value => <b>{value}</b>; external(native('text'));
    }}>run</button>;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('does not fix argument positions after a spread of unknown length', async () => {
    const plan = await link(`const second = (first, value) => value;
      export default () => <p>{second(...external(), 'text')}</p>;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('resolves an optional member of a computed function result', async () => {
    const plan = await link(`import { useComputed$ } from '@qwik.dev/core';
      export default () => { const value = useComputed$(async () => ({label: 'text'}));
        return <p>{value.value?.label}</p>; };`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test.each([
    [`const value = 'text'; const alias = value;`, 'alias'],
    [`const value = { title: 'text' }; const { title } = value;`, 'title'],
    [`const get = () => 'text';`, 'get()'],
    [`const get = (value) => value;`, `get('text')`],
    [`const get = (value) => value.toUpperCase();`, `get('text')`],
  ])('retains scalar aliases and function results: %s', async (setup, value) => {
    expect(
      holes(await link(`export default () => { ${setup} return <p>{${value}}</p>; };`))
    ).toEqual([Shape.Text]);
  });

  test('distinguishes numeric row indexes from literal zero', async () => {
    const plan = await link(`export default () => <div>{['one', 'two'].map((value, index) =>
      <p>{['first', external()][index]}</p>)}</div>;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('includes assignments to individual array elements', async () => {
    const plan = await link(`export default () => { const items = ['first'];
      items[1] = external(); return <div>{items.map((value, index) => <p key={index}>{value}</p>)}</div>; };`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('solves forwarding cycles with known input', async () => {
    const plan = await link(`const A = p => <><span>{p.value}</span><B value={p.value} /></>;
      const B = p => <A value={p.value} />;
      export default () => <A value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Text]);
  });

  test('terminates cycles that keep expanding a property path', async () => {
    const plan = await link(`const A = props => <><p>{props.value}</p><A {...props.next} /></>;
      export default () => <A value="text" next={external()} />;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('does not specialize a component passed to an unknown consumer', async () => {
    const plan = await link(`const Label = props => <p>{props.value}</p>;
      external(Label); export default () => <Label value="text" />;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });

  test('includes external inputs to an exported entry function', async () => {
    const plan = await link(`export default function get(value) { return value; }
      const result = get('text'); export const App = () => <p>{result}</p>;`);
    expect(holes(plan)).toEqual([Shape.Unknown]);
  });
});
