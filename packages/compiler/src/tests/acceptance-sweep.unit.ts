/** Cutover gate: every e2e app source compiles through the pipeline in both environments. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { transformModules } from '../transform-modules';

const appsRoot = resolve(__dirname, '../../../../e2e/qwik-e2e/apps');

/**
 * Rejects the pipeline refuses by design (authored shapes awaiting approved fixture edits) or that
 * a later cutover step owns. Shrinking this list is the metric; a new entry needs a hand edit.
 */
const KNOWN_REJECTS: Record<string, string | { reason: string; isServer: boolean }> = {
  'e2e/src/components/render/render.tsx':
    'pipeline does not support: a non-QRL component event handler',
  'e2e/src/components/streaming/demo.tsx': 'children-function',
  'e2e/src/components/streaming/streaming.tsx': 'children-function',
  'perf.prod/src/components/component-impl/index.tsx':
    'pipeline does not support: a non-QRL component event handler',
  'qwikrouter-test/src/routes/(common)/catchall-loader/[...slug]/index.tsx':
    'pipeline does not support: a QRL callback capturing "runCount"',
  'qwikrouter-test/src/routes/(common)/server-func/index.tsx':
    'pipeline does not support: a generator QRL callback',
  'todo-old-test/src/components/footer/footer.tsx':
    'pipeline does not support: a branch arm capturing "Filter"',
  'todo-old-test/src/entry.dev.tsx': 'unsupported-runtime-jsx',
  'vdomless-counter/src/build-data/build-data.ts': 'expression-hook',
  'todo-test/src/components/footer/footer.tsx':
    'pipeline does not support: a branch arm capturing "Filter"',
};
const skipDirs = new Set(['node_modules', 'dist', '.native', 'server']);

function sources(dir: string, into: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (!skipDirs.has(entry)) {
        sources(path, into);
      }
    } else if (/\.(tsx|jsx|ts)$/.test(entry) && !/\.d\.ts$/.test(entry)) {
      into.push(path);
    }
  }
  return into;
}

describe('acceptance sweep', () => {
  test.each([true, false])(
    'e2e apps compile with isServer=%s',
    async (isServer) => {
      const rejected: string[] = [];
      for (const file of sources(appsRoot)) {
        const path = relative(appsRoot, file);
        try {
          const output = await transformModules({
            input: [{ path, code: readFileSync(file, 'utf8') }],
            srcDir: '.',
            sourceMaps: false,
            transpileTs: true,
            transpileJsx: true,
            isServer,
          });
          const errors = output.diagnostics.filter((diagnostic) => diagnostic.category === 'error');
          if (errors.length > 0) {
            rejected.push(`${path}: ${errors.map((diagnostic) => diagnostic.code).join(', ')}`);
          }
        } catch (error) {
          // Generation names its module in the message; the path already leads the entry.
          rejected.push(
            `${path}: ${(error as Error).message.split('\n')[0].replace(/ \(in [^)]*\)$/, '')}`
          );
        }
      }
      const known = Object.entries(KNOWN_REJECTS)
        .filter(([, entry]) => typeof entry === 'string' || entry.isServer === isServer)
        .map(([path, entry]) => `${path}: ${typeof entry === 'string' ? entry : entry.reason}`);
      expect(rejected.filter((entry) => !known.includes(entry))).toEqual([]);
      // A known reject that stopped rejecting must leave the list.
      expect(known.filter((entry) => !rejected.includes(entry))).toEqual([]);
    },
    120_000
  );
});
