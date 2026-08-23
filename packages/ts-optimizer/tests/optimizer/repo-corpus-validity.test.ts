import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModulesOptions } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

function trackedSourceFiles(): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '*.ts', '*.tsx'], {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return listed.split('\0').filter((f) => f && !f.includes('node_modules'));
}

/**
 * Every module the optimizer emits is a `.js` file, so it has to be valid JavaScript, and the
 * TS-strip pass throws when it cannot parse what we generated. That makes the whole repo a corpus:
 * codegen broken for a shape no fixture covers fails here instead of surfacing as a bundler parse
 * error in someone's app. Both entry strategies run because dev SSR hoists while clients split.
 */
it('emits parseable code for every source file in the repo', () => {
  const failures: string[] = [];
  let transformed = 0;
  for (const relPath of trackedSourceFiles()) {
    const code = readFileSync(`${REPO_ROOT}/${relPath}`, 'utf-8');
    for (const isServer of [false, true]) {
      try {
        transformModule({
          input: [{ path: mkFilePath(relPath), code: mkSourceText(code) }],
          srcDir: mkFilePath('.'),
          entryStrategy: isServer ? { type: 'hoist' } : { type: 'smart' },
          minify: 'simplify',
          transpileTs: true,
          transpileJsx: true,
          explicitExtensions: true,
          preserveFilenames: true,
          mode: 'prod',
          isServer,
        } as TransformModulesOptions);
        transformed++;
      } catch (err) {
        failures.push(`${relPath} (isServer=${isServer}): ${(err as Error).message}`);
      }
    }
  }
  expect(failures).toEqual([]);
  expect(transformed).toBeGreaterThan(1000);
}, 300_000);
