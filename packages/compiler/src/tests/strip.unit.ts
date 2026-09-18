/**
 * Server-only stripping: the client build keeps a boundary's identity but never ships its callback,
 * and a server-only export keeps its name but not its body. The server build registers the
 * boundaries it must be able to call by symbol.
 */
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const SERVER_CTX_NAMES = ['route', 'server', 'action$', 'loader$', 'globalAction$'];
const SERVER_EXPORTS = ['onGet', 'onPost', 'onRequest'];
const REGISTER_CTX_NAMES = ['server'];
const CLIENT_CTX_NAMES = ['useVisibleTask', 'client', 'browser', 'event$'];

const COMPONENT = `import { component$, useVisibleTask$, useSignal, useTask$ } from '@qwik.dev/core';
export default component$(() => {
  const count = useSignal(0);
  useVisibleTask$(() => { count.value = count.value + 1; });
  useTask$(() => { count.value = 2; });
  return <button onClick$={() => count.value++}>{count.value}</button>;
});
`;

const ROUTE = `import { routeLoader$, server$ } from '@qwik.dev/router';
export const useData = routeLoader$(async () => ({ total: secret() }));
export const send = server$(async (value: number) => value * secret());
export const onGet = () => new Response(String(secret()));
function secret() {
  return 42;
}
export default () => <button onClick$={() => send(1)}>go</button>;
`;

async function compile(
  isServer: boolean,
  strip: Partial<Parameters<typeof transformModules>[0]>,
  code = ROUTE
) {
  const output = await transformModules({
    srcDir: 'src',
    sourceMaps: false,
    transpileTs: true,
    transpileJsx: true,
    isServer,
    input: [{ path: 'src/routes/index.tsx', code }],
    ...strip,
  });
  return {
    output,
    main: output.modules.find((module) => module.path === 'src/routes/index.tsx')!.code,
    chunks: output.modules.filter((module) => module.segment !== null).map((module) => module.path),
  };
}

describe('server-only stripping', () => {
  test('the client keeps a stripped boundary as a noop QRL and ships no chunk', async () => {
    const { main, chunks } = await compile(false, { stripCtxName: SERVER_CTX_NAMES });

    expect(chunks.filter((path) => /routeLoader|server/.test(path))).toEqual([]);
    expect(main).toMatch(/routeLoaderQrl\(\s*_noopQrl\(/);
    expect(main).toMatch(/serverQrl\(\s*_noopQrl\(/);
    // the callback's body never reaches the browser
    expect(main).not.toContain('value * secret()');
  });

  test('the client replaces a server-only export body with a fail-loud stub', async () => {
    const { main } = await compile(false, { stripExports: SERVER_EXPORTS });

    expect(main).toContain('export const onGet =');
    expect(main).not.toContain('new Response(String(secret()))');
    expect(main).toMatch(/throw new Error\(/);
  });

  test('the server registers the boundaries it must call by symbol', async () => {
    const { main } = await compile(true, { regCtxName: REGISTER_CTX_NAMES });

    // the server resolves an RPC by the segment hash, so the mirror registers under it
    expect(main).toMatch(/_regSymbol\(async \(value\) => \{[\s\S]*?\}, "[a-z0-9]+"\)/);
    expect(main).toMatch(/q_index_serverqrl_segment_1_[a-z0-9]+\.s\(/);
    // a registered boundary still ships its implementation on the server
    expect(main).toContain('value * secret()');
  });

  test('the server keeps a client-only task as a symbol with its captures', async () => {
    const { main, chunks } = await compile(true, { stripCtxName: CLIENT_CTX_NAMES }, COMPONENT);

    expect(chunks.filter((path) => /useVisibleTask/.test(path))).toEqual([]);
    // the symbol and its captures still serialize; the body must not be runnable here
    expect(main).toMatch(/q_index_useVisibleTaskqrl_segment_0_[a-z0-9]+\.w\(\[count\]\)/);
    expect(main).not.toContain('count.value = count.value + 1');
    // a task the server does run is untouched
    expect(main).toContain('count.value = 2');
  });

  test('without strip options every boundary ships as usual', async () => {
    const { main, chunks } = await compile(false, {});

    expect(chunks.some((path) => /routeLoader/.test(path))).toBe(true);
    expect(main).not.toContain('_noopQrl(');
  });
});
