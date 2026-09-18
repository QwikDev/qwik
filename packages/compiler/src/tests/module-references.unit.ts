import { expect, test } from 'vitest';
import { transformModules } from '../index';

test.each([true, false])('module bindings are shared through ESM (SSR: %s)', async (isServer) => {
  const output = await transformModules({
    input: [
      {
        path: 'src/app.tsx',
        code: `import { useComputed$, useSignal, useTask$ } from '@qwik.dev/core';
const prefix = 'Saved';
const settings = { suffix: '!' };
function format(value) { return prefix + ': ' + value; }
export const App = () => {
  const count = useSignal(2);
  const title = useComputed$(() => format(count.value));
  useTask$(() => console.log(settings.suffix, title.value));
  return <button onClick$={() => console.log(format(count.value), settings)}>{title.value}</button>;
};`,
      },
    ],
    isServer,
  });
  expect(output.diagnostics).toEqual([]);
  const main = output.modules[0];
  expect(main.code).toContain('export { format as __qwik_format, settings as __qwik_settings };');
  const chunks = output.modules.filter((module) => module.segment !== null);
  const computed = chunks.find((module) => module.segment?.ctxName === 'useComputed$')!;
  const task = chunks.find((module) => module.segment?.ctxName === 'useTask$')!;
  const event = chunks.find((module) => module.segment?.ctxKind === 'eventHandler')!;
  expect(computed.code).toContain('import { __qwik_format as format } from "./app.tsx";');
  expect(task.code).toContain('import { __qwik_settings as settings } from "./app.tsx";');
  expect(event.code).toContain(
    'import { __qwik_format as format, __qwik_settings as settings } from "./app.tsx";'
  );
  expect(computed.segment?.captureNames).toEqual(['count']);
  expect(task.segment?.captureNames).toEqual(['title']);
  expect(event.segment?.captureNames).toEqual(['count']);
  for (const chunk of chunks) {
    expect(chunk.code).not.toContain("'Saved'");
    expect(chunk.code).not.toContain('function format');
  }
});

test.each([
  ['export const value = 1;', 'value'],
  ['const value = 1; export { value as publicValue };', 'publicValue as value'],
  ['const value = 1; export { value as "a-b" };', '"a-b" as value'],
])('existing exports are reused: %s', async (declaration, specifier) => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `${declaration}
export const App = () => <button onClick$={() => console.log(value)}>save</button>;`,
      },
    ],
    isServer: false,
  });
  expect(output.modules[0].code).not.toContain('__qwik_');
  expect(output.modules[1].code).toContain(`import { ${specifier} } from "./app.tsx";`);
  expect(output.modules[1].segment?.captures).toBe(false);
});

test('a default export snapshot is not reused as a live binding', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `let value = 1;
export default value;
value = 2;
export const App = () => <button onClick$={() => value}>save</button>;`,
      },
    ],
    isServer: false,
  });
  expect(output.modules[0].code).toContain('export { value as __qwik_value };');
  expect(output.modules[1].code).toContain('import { __qwik_value as value } from "./app.tsx";');
});

test.each(['value++', 'value = 2', '({ value } = source)'])(
  'writes to module bindings remain unsupported: %s',
  async (expression) => {
    await expect(
      transformModules({
        input: [
          {
            path: 'app.tsx',
            code: `let value = 1;
export default () => <button onClick$={() => { ${expression}; }}>save</button>;`,
          },
        ],
        isServer: false,
      })
    ).rejects.toThrow('capturing "value"');
  }
);

test('synthetic export names avoid authored exports', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `const value = 1;
export { value as __qwik_other };
export const __qwik_value = 2;
const other = 3;
export default () => <button onClick$={() => console.log(other)}>save</button>;`,
      },
    ],
    isServer: false,
  });
  expect(output.modules[0].code).toContain('export { other as __qwik_other0 };');
  expect(output.modules[1].code).toContain('import { __qwik_other0 as other } from "./app.tsx";');
});

test('shadowed callback parameters do not export module bindings', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `const value = 1;
export default () => <button onClick$={(value) => console.log(value)}>save</button>;`,
      },
    ],
    isServer: false,
  });
  expect(output.modules[0].code).not.toContain('__qwik_');
  expect(output.modules[1].code).not.toContain('./app.tsx');
});

test('module-only uses do not create synthetic exports', async () => {
  const output = await transformModules({
    input: [
      {
        path: 'app.tsx',
        code: `function format() { return 'title'; }
export default () => { const title = format(); return <p>{title}</p>; };`,
      },
    ],
    isServer: true,
  });
  expect(output.diagnostics).toEqual([]);
  expect(output.modules[0].code).not.toContain('__qwik_');
});
