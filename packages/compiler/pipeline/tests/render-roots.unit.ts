import { expect, test } from 'vitest';
import { extractRenderRoots } from '../render-roots';

test('extracts nested render roots with their reachable declarations', () => {
  const code = `import { component$, useSignal } from '@qwik.dev/core';
const unrelated = 'skip';
describe('suite', () => {
  it('renders', async () => {
    const Child = component$(() => <span>child</span>);
    const App = component$(() => {
      const count = useSignal(0);
      return <button><Child />{count.value}</button>;
    });
    await render(App);
  });
});`;

  expect(extractRenderRoots('src/example.spec.tsx', code)).toEqual([
    {
      argumentStart: code.indexOf('App);'),
      argumentEnd: code.indexOf('App);') + 3,
      exportName: 'App',
      sourceIndex: 0,
      code: expect.stringContaining('export const Child = component$'),
    },
  ]);
  const [root] = extractRenderRoots('src/example.spec.tsx', code);
  expect(root.code).toContain('export const App = component$');
  expect(root.code).not.toContain('unrelated');
});

test('keeps imports used by extracted render roots', () => {
  const code = `import { component$ } from '@qwik.dev/core';
import { Child, label } from './child';
it('renders', async () => {
  const App = component$(() => <Child>{label}</Child>);
  await render(App);
});`;

  const [root] = extractRenderRoots('src/example.spec.tsx', code);

  expect(root.code).toContain("import { Child, label } from './child';");
});

test('extracts roots passed to render methods', () => {
  const code = `it('renders', async () => {
  const App = () => <main />;
  await harness.render(App);
});`;

  expect(extractRenderRoots('src/example.spec.tsx', code)).toHaveLength(1);
});

test('keeps render roots from one test scope in one source module', () => {
  const code = `import { component$ } from '@qwik.dev/core';
it('renders', async () => {
  const shared = {};
  const First = component$(() => <main>{shared}</main>);
  const Second = component$(() => <aside>{shared}</aside>);
  await render(First);
  await render(Second);
});`;

  const [first, second] = extractRenderRoots('src/example.spec.tsx', code);

  expect(first.sourceIndex).toBe(second.sourceIndex);
  expect(first.code).toBe(second.code);
  expect(first.code.match(/export const shared/g)).toHaveLength(1);
  expect(first.code).toContain('export const First = component$');
  expect(first.code).toContain('export const Second = component$');
});
