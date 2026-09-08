import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { assert, test } from 'vitest';
import { transformModules } from '../../../compiler/pipeline/compat/transform-modules';
import type { OptimizerOptions } from '../types';
import { createTestResume, type TestResumeTransformMetadata } from './test-resume';
import { qwikVite, type QwikVitePlugin } from './vite';

const TEST_RESUME_REGISTRY = Symbol.for('@qwik.dev/core/testing/resume');
const TEST_COMPILED = Symbol.for('@qwik.dev/core/testing/compiled');
const TEST_TARGET = Symbol.for('@qwik.dev/core/testing/target');
const coreSource = fileURLToPath(new URL('../../../qwik/dist/core.mjs', import.meta.url));
const preloaderSource = fileURLToPath(new URL('../../../qwik/dist/preloader.mjs', import.meta.url));

test('does not alias ordinary modules without generated chunks', async () => {
  const harness = createTestResume();
  harness.configure('resume');
  try {
    await harness.transform(
      { input: [{ path: 'helper.ts', code: 'export const value = {};' }], isServer: true },
      '/src/helper.ts',
      '/src',
      path,
      (id) => id
    );
    assert.equal(harness.hasOutput('/src/helper.ts'), false);
    assert.equal(harness.hasOutput('/src/helper.qwik-test-client.ts'), false);
  } finally {
    harness.clear();
  }
});

for (const target of ['csr', 'ssr', 'resume'] as const) {
  test(`uses pipeline output for both sides of the ${target} harness`, async () => {
    const harness = createTestResume();
    harness.configure(target);
    const options = {
      input: [
        {
          path: 'counter.tsx',
          code: `
        import { useSignal } from '@qwik.dev/core';
        export const Counter = () => {
          const count = useSignal(0);
          return <button onClick$={() => count.value++}>{count.value}</button>;
        };
      `,
        },
      ],
      isServer: target !== 'csr',
      transpileTs: true,
    };
    try {
      const expectedServer = await transformModules(options);
      const expectedClient = await transformModules({
        ...options,
        isServer: false,
        entryStrategy: { type: 'segment' },
      });
      const result = await harness.transform(options, '/src/counter.tsx', '/src', path, (id) => id);
      const clientModules = expectedClient.modules.filter(
        (module) => module.isEntry || module.segment
      );
      assert.deepEqual(result?.output.modules, expectedServer.modules);
      assert.deepEqual(result?.modules.slice(-clientModules.length), clientModules);
    } finally {
      harness.clear();
    }
  });
}

test('resolves generated chunks from a CSR test root', async () => {
  const harness = createTestResume();
  harness.configure('csr');
  try {
    const result = await harness.transform(
      {
        input: [
          {
            path: 'counter.tsx',
            code: `import { useSignal } from '@qwik.dev/core';
export const Counter = () => {
  const count = useSignal(0);
  return <button onClick$={() => count.value++}>{count.value}</button>;
};`,
          },
        ],
        isServer: false,
        srcDir: '/src',
        transpileTs: true,
      },
      '/src/counter.tsx',
      '/src',
      path,
      (id) => id
    );
    const chunk = result!.modules.find((module) => module.segment !== null)!;
    const resolution = await harness.resolveId(
      {} as any,
      `./${chunk.path}`,
      '/src/counter.tsx',
      false,
      (id) => id
    );

    assert.equal(typeof resolution === 'object' && resolution?.id, `/src/${chunk.path}`);
  } finally {
    harness.clear();
  }
});

test('keeps SSR node resolution and resumes through transitive browser resolution', async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'qwik-vite-resume-')));
  const srcDir = path.join(root, 'src');
  const callbacks: string[] = [];

  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeConditionalPackage(root, 'resume-child', 'browser-child', 'node-child');
  await writeConditionalPackage(
    root,
    'resume-condition',
    `import { target as child } from 'resume-child';\nexport const target = 'browser:' + child;`,
    `export const target = 'node';`,
    true
  );
  await writeFile(
    path.join(srcDir, 'entry.tsx'),
    `import { component$ } from '@qwik.dev/core';
import { target } from 'resume-condition';

export const serverTarget = target;
const state = { calls: 0 };
function format() { return target + ':' + ++state.calls; }
export const readCalls = () => state.calls;
export const App = component$(() => (
  <main>
    <button onClick$={() => target}>resume</button>
    <button onClick$={() => ({ state, result: format() })}>first</button>
    <button onClick$={() => ({ state, result: format() })}>second</button>
  </main>
));
`
  );

  const plugins = qwikVite({
    srcDir,
    testTarget: 'resume',
    optimizerOptions: mockOptimizerOptions(root),
    devTools: { imageDevTools: false, hmr: false },
  }) as any[];
  const plugin = plugins[0] as QwikVitePlugin;
  plugin.api.onSegment((_parentId, segment) => callbacks.push(segment.name));

  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    mode: 'test',
    plugins,
    resolve: {
      alias: [
        { find: /^@qwik.dev\/core$/, replacement: coreSource },
        { find: /^@qwik.dev\/core\/preloader$/, replacement: preloaderSource },
      ],
    },
    root,
    server: { middlewareMode: true, watch: null },
  });

  try {
    const entry = await server.ssrLoadModule('/src/entry.tsx');
    assert.equal(entry.serverTarget, 'node');
    assert.equal((globalThis as any)[TEST_COMPILED], true);

    const registry = (globalThis as any)[TEST_RESUME_REGISTRY] as Map<
      string,
      TestResumeTransformMetadata
    >;
    const metadata = registry.get(path.join(srcDir, 'entry.tsx').replaceAll('\\', '/'));
    assert.ok(metadata);
    const eventModules = metadata.client.filter(
      (module) => module.segment?.ctxKind === 'eventHandler'
    );
    const [eventModule, firstModule, secondModule] = eventModules;
    assert.ok(eventModule?.segment);
    assert.ok(firstModule?.segment);
    assert.ok(secondModule?.segment);

    const event = await server.ssrLoadModule(eventModule.path);
    assert.equal(await event[eventModule.segment.name](), 'browser:browser-child');
    const firstEvent = await server.ssrLoadModule(firstModule.path);
    const first = await firstEvent[firstModule.segment.name]();
    const secondEvent = await server.ssrLoadModule(secondModule.path);
    const second = await secondEvent[secondModule.segment.name]();
    assert.equal(first.result, 'browser:browser-child:1');
    assert.equal(second.result, 'browser:browser-child:2');
    assert.equal(first.state, second.state);
    assert.equal(first.state.calls, 2);
    assert.equal(entry.readCalls(), 0);
    assert.deepEqual(
      callbacks,
      eventModules.map((module) => module.segment!.name)
    );
    assert.ok(metadata.server.length > 0);
    assert.equal(registry.get(path.join(srcDir, 'entry.tsx').replaceAll('\\', '/')), metadata);
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('enables the compiler harness for the default SSR test target', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qwik-vite-ssr-'));
  const srcDir = path.join(root, 'src');
  await mkdir(srcDir, { recursive: true });
  await writeFile(path.join(root, 'package.json'), '{"type":"module"}');
  await writeFile(
    path.join(srcDir, 'entry.tsx'),
    `import { component$ } from '@qwik.dev/core';
export const App = component$(() => <button>ssr</button>);`
  );

  const server = await createServer({
    appType: 'custom',
    configFile: false,
    logLevel: 'silent',
    mode: 'test',
    plugins: qwikVite({
      srcDir,
      optimizerOptions: mockOptimizerOptions(root),
      devTools: { imageDevTools: false, hmr: false },
    }),
    resolve: {
      alias: [
        { find: /^@qwik.dev\/core$/, replacement: coreSource },
        { find: /^@qwik.dev\/core\/preloader$/, replacement: preloaderSource },
      ],
    },
    root,
    server: { middlewareMode: true, watch: null },
  });

  try {
    await server.ssrLoadModule('/src/entry.tsx');
    assert.equal((globalThis as any)[TEST_COMPILED], true);
    assert.equal((globalThis as any)[TEST_TARGET], 'ssr');
  } finally {
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
});

async function writeConditionalPackage(
  root: string,
  name: string,
  browser: string,
  node: string,
  source = false
): Promise<void> {
  const packageDir = path.join(root, 'node_modules', name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name,
      type: 'module',
      exports: { '.': { browser: './browser.js', node: './node.js', default: './node.js' } },
    })
  );
  await writeFile(
    path.join(packageDir, 'browser.js'),
    source ? browser : `export const target = ${JSON.stringify(browser)};`
  );
  await writeFile(
    path.join(packageDir, 'node.js'),
    source ? node : `export const target = ${JSON.stringify(node)};`
  );
}

function mockOptimizerOptions(root: string): OptimizerOptions {
  return {
    sys: {
      cwd: () => root,
      env: 'node',
      os: process.platform,
      dynamicImport: async (id) => import(id),
      strictDynamicImport: async (id) => import(id),
      path: path as any,
    },
    binding: { mockBinding: true },
  };
}
