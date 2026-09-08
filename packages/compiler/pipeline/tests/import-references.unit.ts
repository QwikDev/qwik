import { expect, test } from 'vitest';
import { analyseModule, linkPlans, transformModules } from '../index';
import { EntryKind, LinkResultKind } from '../schema';
import { ResolutionKind } from '../link/link-plans';
import { deepFreeze, serverSpecialization } from './fixtures';

const code = `import { useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
import fallback, { calculate as price, save, unused } from './pricing';
import * as logger from './logger';
export const App = () => {
  const count = useSignal(2);
  const total = useComputed$(() => price(count.value, fallback));
  useTask$(() => logger.write(total.value));
  return <button onClick$={() => save(count.value)}>{total.value}</button>;
};`;

test.each([true, false])(
  'imports remain module references in every QRL (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      input: [{ path: 'src/app.tsx', code }],
      isServer,
      transpileTs: true,
    });
    expect(output.diagnostics).toEqual([]);
    const chunks = output.modules.filter((module) => module.segment !== null);
    const computed = chunks.find((module) => module.code.includes('price(count.value'))!;
    const task = chunks.find((module) => module.code.includes('logger.write('))!;
    const event = chunks.find((module) => module.code.includes('save(count.value)'))!;
    expect(computed.code).toContain('import fallback, { calculate as price } from "./pricing";');
    expect(task.code).toContain('import * as logger from "./logger";');
    expect(event.code).toContain('import { save } from "./pricing";');
    expect(computed.segment?.captureNames).toEqual(['count']);
    expect(task.segment?.captureNames).toEqual(['total']);
    expect(event.segment?.captureNames).toEqual(['count']);
    expect(chunks.every((module) => !module.code.includes('unused'))).toBe(true);
  }
);

test('linking keeps import dependencies reachable through QRL uses', async () => {
  const plan = deepFreeze(
    await analyseModule({ path: 'src/app.tsx', code }, { transpileTs: true })
  );
  const linked = linkPlans(
    [plan],
    [{ kind: EntryKind.Export, module: plan.path, export: 'App' }],
    serverSpecialization(),
    {
      edges: {
        [plan.path]: Object.fromEntries(
          plan.edges.map((edge) => [edge.id, { r: ResolutionKind.External }])
        ),
      },
    },
    { claims: [], policies: [], emissions: [] },
    true
  );
  expect(linked.kind).toBe(LinkResultKind.Linked);
  if (linked.kind !== LinkResultKind.Linked) {
    return;
  }
  expect(
    linked.plan.modules[0].edges.filter((edge) => edge.runtime).map((edge) => edge.specifier)
  ).toContain('./pricing');
  expect(
    linked.plan.modules[0].edges.filter((edge) => edge.runtime).map((edge) => edge.specifier)
  ).toContain('./logger');
});

test.each([true, false])(
  'restores core aliases in chunks and SSR mirrors (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      input: [
        {
          path: 'app.tsx',
          code: `import { useComputed$, getLocale as locale } from '@qwik.dev/core';
export default () => { const lang = useComputed$(() => locale()); return <p>{lang.value}</p>; };`,
        },
      ],
      isServer,
    });
    expect(output.diagnostics).toEqual([]);
    const chunk = output.modules.find((module) => module.segment !== null)!;
    expect(chunk.code).toContain('getLocale as locale');
    expect(chunk.segment?.captures).toBe(false);
    if (isServer) {
      expect(output.modules[0].code).toContain('getLocale as locale');
    }
  }
);

test('shadowing and object property names do not import unrelated bindings', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `import { save } from './api';
export default () => <button onClick$={(save) => ({ save, value: save })}>save</button>;`,
      },
    ],
    isServer: false,
  });
  const chunk = output.modules.find((module) => module.segment !== null)!;
  expect(chunk.code).not.toContain('./api');
  expect(chunk.segment?.captures).toBe(false);
});

test('quoted import names and import attributes survive chunk emission', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `import { 'a-b' as label } from './labels.json' with { type: 'json' };
export default () => <button onClick$={() => ({ label })}>save</button>;`,
      },
    ],
    isServer: false,
  });
  const chunk = output.modules.find((module) => module.segment !== null)!;
  expect(chunk.code).toContain(
    'import { "a-b" as label } from "./labels.json" with { "type": "json" };'
  );
  expect(chunk.segment?.captures).toBe(false);
});

test.each([true, false])(
  'projection chunks own their imports, not their event imports (SSR: %s)',
  async (isServer) => {
    const output = await transformModules({
      input: [
        {
          path: 'app.tsx',
          code: `import { Card, Label } from './components';
import { save } from './api';
export default () => <Card><Label /><button onClick$={() => save()}>save</button></Card>;`,
        },
      ],
      isServer,
    });
    expect(output.diagnostics).toEqual([]);
    const chunks = output.modules.filter((module) => module.segment !== null);
    const projection = chunks.find((module) => module.code.includes('createComponent(Label'))!;
    expect(projection.code).toContain('import { Label } from "./components";');
    expect(projection.code).not.toContain('from "./api"');
    const event = chunks.find((module) => module.code.includes('save()'))!;
    expect(event.code).toContain('import { save } from "./api";');
    expect(event.code).not.toContain('from "./components"');
  }
);

test('a core import used directly in setup remains in the main module', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `import { getLocale as locale } from '@qwik.dev/core';
export default () => { const languages = [locale()]; return <p>{languages[0]}</p>; };`,
      },
    ],
    isServer: false,
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules[0].code).toContain('getLocale as locale');
});
