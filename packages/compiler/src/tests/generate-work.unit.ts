/** Generation work grows with the module, not with the module times its chunks or ops. */
import { afterEach, describe, expect, test, vi } from 'vitest';
import { analyseModule } from '../analyse/analyse-module';
import { linkPlans } from '../link/link-plans';
import { generateJsCsr } from '../generate/js-csr';
import { generateJsSsr } from '../generate/js-ssr';
import {
  BuildMode,
  EntryKind,
  Environment,
  LinkResultKind,
  type LinkedModule,
  type LinkedPlan,
} from '../schema';

const path = 'src/app.tsx';
const head = `import { component$, useSignal } from '@qwik.dev/core';\n`;
const range = (count: number) => Array.from({ length: count }, (_, index) => index);

const inputs: Record<string, (count: number) => string> = {
  handlers: (count) =>
    `${head}export const App = component$(() => {\n  const s = useSignal(0);\n  return <div>${range(
      count
    )
      .map((index) => `<button onClick$={() => (s.value += ${index})}>b${index}</button>`)
      .join('')}</div>;\n});\n`,
  lists: (count) =>
    `${head}export const App = component$(() => {\n  const items = useSignal([1, 2]);\n  return <div>${range(
      count
    )
      .map((index) => `<ul>{items.value.map((x) => <li key={x}>${index}:{x}</li>)}</ul>`)
      .join('')}</div>;\n});\n`,
  imports: (count) =>
    `${range(count)
      .map((index) => `import { f${index} } from './m${index}';\n`)
      .join('')}${head}export const App = component$(() => <div>${range(count)
      .map((index) => `<button onClick$={() => f${index}()}>b${index}</button>`)
      .join('')}</div>);\n`,
  content: (count) =>
    `${head}export const App = component$((props: { items: unknown[] }) => {\n${range(count)
      .map((index) => `  const s${index} = useSignal(${index});\n`)
      .join('')}  return <div>${range(count)
      .map((index) => `<p>{s${index}.value ? props.items[${index}] : null}</p>`)
      .join('')}</div>;\n});\n`,
  components: (count) =>
    `${head}${range(count)
      .map(
        (index) =>
          `export const C${index} = component$(() => { const s = useSignal(${index}); return <button onClick$={() => s.value++}>{s.value}</button>; });\n`
      )
      .join('')}export const App = component$(() => <div>${range(count)
      .map((index) => `<C${index} />`)
      .join('')}</div>);\n`,
};

async function linkedPlan(code: string, environment: Environment): Promise<LinkedPlan> {
  const plan = await analyseModule({ path, code }, { transpileTs: true });
  const linked = linkPlans(
    [plan],
    [{ kind: EntryKind.Module, module: path }],
    { environment, mode: BuildMode.Dev, strip: { exports: [], ctxName: [], regCtxName: [] } },
    { edges: {} },
    false
  );
  if (linked.kind === LinkResultKind.Failed) {
    throw new Error('expected the fixture to link');
  }
  return linked.plan;
}

/** Reads of the module tables during generation, a proxy for per-chunk and per-op scans. */
async function countTableReads(code: string, environment: Environment): Promise<number> {
  const plan = await linkedPlan(code, environment);
  let reads = 0;
  const counted = <T extends object>(table: T): T =>
    new Proxy(table, {
      get: (target, property, receiver) => {
        reads++;
        return Reflect.get(target, property, receiver);
      },
    });
  const module: LinkedModule = plan.modules[0];
  const countedModule: LinkedModule = {
    ...module,
    bindings: counted(module.bindings),
    qrls: counted(module.qrls),
    imports: counted(module.imports),
    edges: counted(module.edges),
  };
  const generate = environment === Environment.Server ? generateJsSsr : generateJsCsr;
  await generate({ ...plan, modules: [countedModule] }, { outputSourceMaps: false });
  return reads;
}

describe('generation work', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe.each([Environment.Browser, Environment.Server])('%s target', (environment) => {
    test.each(Object.keys(inputs))(
      'reads the module tables in proportion to the %s count',
      async (dim) => {
        const small = await countTableReads(inputs[dim](40), environment);
        const large = await countTableReads(inputs[dim](80), environment);
        // Linear work doubles; a scan per chunk or per op quadruples.
        expect(large / small).toBeLessThan(2.5);
      }
    );
  });

  test('serializes a run of static children once on the server', async () => {
    const parse = vi.spyOn(JSON, 'parse');
    const parsedLength = async (count: number) => {
      const code = `${head}export const App = component$(() => {\n  const s = useSignal(0);\n  return <div>{s.value}${range(
        count
      )
        .map((index) => `<span class="c${index}">item ${index}</span>`)
        .join('')}</div>;\n});\n`;
      const plan = await linkedPlan(code, Environment.Server);
      parse.mockClear();
      await generateJsSsr(plan, { outputSourceMaps: false });
      return parse.mock.calls.reduce((sum, [text]) => sum + text.length, 0);
    };
    const small = await parsedLength(200);
    const large = await parsedLength(400);
    expect(large / small).toBeLessThan(2.5);
  });
});
