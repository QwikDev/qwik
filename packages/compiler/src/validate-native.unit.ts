import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from './index';

/**
 * Native target mode (specs/09): under `nativeTarget`, plan sites that would rely on the JS
 * source-text fallback become compile errors; with the option unset the JS path never regresses.
 */
const compile = async (code: string, nativeTarget?: string) => {
  const result = await transformModules({
    input: [{ path: 'src/input.tsx', code }],
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer: true,
    ...(nativeTarget === undefined ? {} : { nativeTarget }),
  } as TransformModulesOptions & { nativeTarget?: string });
  return result.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
  }));
};

const LOWERABLE = `
import { useSignal } from '@qwik.dev/core';
export function App() {
  const count = useSignal(3);
  return <button onClick$={() => count.value++}>{count.value}</button>;
}
`;

const UNLOWERABLE_EXPRESSION = `
import { useSignal } from '@qwik.dev/core';
import { format } from './format';
export function App() {
  const count = useSignal(3);
  return <p>{format(count.value)}</p>;
}
`;

const UNLOWERABLE_STATEMENT = `
export function App() {
  const stamp = globalThis.buildStamp();
  return <p>{stamp}</p>;
}
`;

const CUSTOM_HOOK = `
import { useMyThing } from './hooks';
export function App() {
  useMyThing();
  return <p>ok</p>;
}
`;

const METHOD_CALL_CONTENT = `
export function App(props: { name: string }) {
  return <p>{props.name.toUpperCase()}</p>;
}
`;

describe('native target readiness', () => {
  test('fully lowerable component produces no diagnostics', async () => {
    expect(await compile(LOWERABLE, 'rust')).toEqual([]);
  });

  test('qwik: method calls lower in content position', async () => {
    expect(await compile(METHOD_CALL_CONTENT, 'rust')).toEqual([]);
  });

  test('unlowerable expression errors only under a native target', async () => {
    expect(await compile(UNLOWERABLE_EXPRESSION)).toEqual([]);
    const diagnostics = await compile(UNLOWERABLE_EXPRESSION, 'rust');
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe('native-expression');
    expect(diagnostics[0].message).toContain('format(count.value)');
  });

  test('unlowerable setup statement errors only under a native target', async () => {
    expect(await compile(UNLOWERABLE_STATEMENT)).toEqual([]);
    const codes = (await compile(UNLOWERABLE_STATEMENT, 'rust')).map((d) => d.code);
    expect(codes).toContain('native-setup-statement');
  });

  test('custom hook errors only under a native target', async () => {
    expect(await compile(CUSTOM_HOOK)).toEqual([]);
    const codes = (await compile(CUSTOM_HOOK, 'rust')).map((d) => d.code);
    expect(codes).toContain('native-custom-hook');
  });
});
