import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createOptimizer as createRustOptimizer } from '@qwik.dev/optimizer';
import { createOptimizer as createTsOptimizer } from '../../../ts-optimizer/src/index';
import { afterAll, describe, expect, it } from 'vitest';

// Apps run their optimizer over the built core, which hoists every core QRL to the top of
// core.qwik.mjs; that only works if core-qrl.mjs (imported first) holds everything those calls need.
// The serializer and server share core's chunks, so entering through them must keep that order.
const dist = join(__dirname, '../../dist');
// Forward slashes, as the Vite plugin passes them; the optimizer embeds srcDir in string literals.
const srcDir = dist.replaceAll('\\', '/');
const workDir = mkdtempSync(join(tmpdir(), 'qwik-core-hoisting-'));

afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const toLocalImports = (code: string, variant: string) =>
  code
    .replaceAll('"@qwik.dev/core/build"', '"./build.mjs"')
    .replaceAll('"@qwik.dev/core/async-local-storage"', '"./stub.mjs"')
    .replaceAll('"@qwik.dev/core/preloader"', '"./stub.mjs"')
    .replaceAll('"@qwik.dev/core"', `"./core${variant}.qwik.mjs"`);

// Dev servers load core.qwik.mjs; production builds resolve the .prod or .min variant.
const builds = [
  ['', 'dev'],
  ['', 'prod'],
  ['.prod', 'prod'],
  ['.min', 'prod'],
] as const;
// The Rust bindings are built, not checked in: local runs may lack them, CI always has them.
const hasRustBindings =
  !!process.env.CI || existsSync(join(__dirname, '../../../optimizer/bindings/qwik.wasm.mjs'));
const optimizerNames = hasRustBindings ? (['rust', 'ts'] as const) : (['ts'] as const);
const cases = builds.flatMap(([variant, mode]) =>
  optimizerNames.flatMap((optimizerName) =>
    [false, true].map((isServer) => {
      const entry = isServer ? 'server' : 'serializer';
      return [optimizerName, `core${variant}`, mode, isServer, entry] as const;
    })
  )
);

describe('core built as a Qwik library', () => {
  it.each(cases)(
    'evaluates after the %s optimizer splits %s (%s, server: %s), entered through the %s',
    async (optimizerName, name, mode, isServer, entry) => {
      const variant = name.slice('core'.length);
      const core = join(dist, `core${variant}.qwik.mjs`);
      if (!existsSync(core)) {
        throw new Error('Build core first: pnpm build.core.dev');
      }
      const createOptimizer = optimizerName === 'rust' ? createRustOptimizer : createTsOptimizer;
      const optimizer = await createOptimizer();
      const output = await optimizer.transformModules({
        input: [{ path: `core${variant}.qwik.mjs`, code: readFileSync(core, 'utf8') }],
        srcDir,
        entryStrategy: { type: isServer ? 'hoist' : 'segment' },
        minify: 'simplify',
        explicitExtensions: true,
        mode,
        isServer,
      });
      expect(output.diagnostics).toEqual([]);
      const segments = output.modules.filter((module) => module.segment);
      expect(segments.length).toBe(isServer ? 0 : 18);

      const dir = mkdtempSync(join(workDir, `${optimizerName}-${name}-${mode}-`));
      const parent = output.modules.find((module) => !module.segment)!;
      writeFileSync(join(dir, `core${variant}.qwik.mjs`), toLocalImports(parent.code, variant));
      const files = new Set([
        `core-qrl${variant}.mjs`,
        `serializer${variant}.mjs`,
        `${entry}${variant}.mjs`,
      ]);
      for (const file of files) {
        writeFileSync(
          join(dir, file),
          toLocalImports(readFileSync(join(dist, file), 'utf8'), variant)
        );
      }
      writeFileSync(
        join(dir, 'build.mjs'),
        `export const isDev = ${mode === 'dev'}, isServer = ${isServer}, isBrowser = ${!isServer};`
      );
      writeFileSync(join(dir, 'stub.mjs'), 'export const getAsyncLocalStorage = () => undefined;');

      const result = execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `await import(${JSON.stringify(pathToFileURL(join(dir, `${entry}${variant}.mjs`)).href)});
           const core = await import(${JSON.stringify(pathToFileURL(join(dir, `core${variant}.qwik.mjs`)).href)});
           const qrl = core._resumeRootsQrl([1]);
           console.log(JSON.stringify({ each: typeof core.Each, hash: qrl.getHash(), file: qrl.dev?.file }));
           process.exit(0);`,
        ],
        { encoding: 'utf8', timeout: 30_000 }
      );
      const { each, hash, file } = JSON.parse(result.trim().split('\n').pop()!);
      expect(each).toBe('function');
      expect(hash).toBe('res');
      if (mode === 'dev') {
        // Dev servers map a core QRL to its segment URL through this file.
        expect(file).toBe(`${srcDir}/core.qwik.mjs`);
      }
    },
    60_000
  );
});

describe("core's build entries", () => {
  // They import core's chunks by file, so another variant would bundle a second core.
  it.each(['./internal/serializer', './server'])(
    '%s resolves to the same core variant as @qwik.dev/core under every condition',
    (subpath) => {
      const { exports } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'));
      const variantsByCondition = (conditions: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(conditions).map(([condition, file]) => [
            condition,
            /(\.prod|\.min)?(\.qwik)?\.mjs$/.exec(file)![1] ?? '',
          ])
        );
      expect(variantsByCondition(exports[subpath].import)).toEqual(
        variantsByCondition(exports['.'].import)
      );
    }
  );
});
