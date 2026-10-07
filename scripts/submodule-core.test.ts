import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { submoduleCore } from './submodule-core.ts';
import type { BuildConfig } from './util.ts';
import { validateModuleTreeshake } from './validate-build.ts';

test('universal core builds preserve conditional async-local-storage imports without warnings', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'qwik-core-build-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const config = {
    srcQwikDir: fileURLToPath(new URL('../packages/qwik/src', import.meta.url)),
    distVersion: 'test',
    distQwikPkgDir: join(directory, 'dist'),
    tscDir: join(directory, 'tsc'),
    dtsDir: join(directory, 'dts'),
  } as BuildConfig;
  const coreDirectory = join(config.tscDir, 'packages/qwik/src/core');
  const declarationDirectory = join(config.dtsDir, 'packages/qwik/src/core/shared/platform');
  await mkdir(coreDirectory, { recursive: true });
  await mkdir(declarationDirectory, { recursive: true });
  await writeFile(
    join(coreDirectory, 'index.js'),
    `export { getAsyncLocalStorage } from '@qwik.dev/core/async-local-storage';`
  );
  await writeFile(join(declarationDirectory, 'async-local-storage.d.ts'), 'export {};');
  const warnings = t.mock.method(console, 'warn', () => {});

  await submoduleCore(config);

  assert.equal(warnings.mock.callCount(), 0);
  for (const filename of ['core.mjs', 'core.prod.mjs']) {
    const code = await readFile(join(config.distQwikPkgDir, filename), 'utf8');
    assert.ok(code.includes('@qwik.dev/core/async-local-storage'), filename);
    await validateModuleTreeshake(join(config.distQwikPkgDir, filename));
  }
  const browserCode = await readFile(join(config.distQwikPkgDir, 'core.min.mjs'), 'utf8');
  assert.ok(!browserCode.includes('@qwik.dev/core/async-local-storage'));
  assert.ok(!browserCode.includes('from "node:async_hooks"'));
});
