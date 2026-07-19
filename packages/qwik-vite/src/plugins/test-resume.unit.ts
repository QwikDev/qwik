import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { assert, test } from 'vitest';
import type { OptimizerOptions } from '../types';
import type { TestResumeTransformMetadata } from './test-resume';
import { qwikVite, type QwikVitePlugin } from './vite';

const TEST_RESUME_REGISTRY = Symbol.for('@qwik.dev/core/testing/resume');
const TEST_COMPILED = Symbol.for('@qwik.dev/core/testing/compiled');
const TEST_TARGET = Symbol.for('@qwik.dev/core/testing/target');
const coreSource = fileURLToPath(new URL('../../../qwik/dist/core.mjs', import.meta.url));
const preloaderSource = fileURLToPath(new URL('../../../qwik/dist/preloader.mjs', import.meta.url));

test('keeps SSR node resolution and resumes through transitive browser resolution', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'qwik-vite-resume-'));
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
export const App = component$(() => (
  <button onClick$={() => target}>resume</button>
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
    const eventModule = metadata.client.find(
      (module) => module.segment?.ctxKind === 'eventHandler'
    );
    assert.ok(eventModule?.segment);

    const event = await server.ssrLoadModule(eventModule.path);
    assert.equal(await event[eventModule.segment.name](), 'browser:browser-child');
    assert.deepEqual(callbacks, [eventModule.segment.name]);
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
