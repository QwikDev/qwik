import { it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformModule } from '../../src/optimizer/transform/index.js';
import type { TransformModulesOptions } from '../../src/optimizer/types/types.js';
import { mkFilePath, mkSourceText } from '../../src/optimizer/types/brands.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');

function sourceFiles(): string[] {
  return globSync('**/*.{ts,tsx}', {
    cwd: REPO_ROOT,
    exclude: [
      '**/node_modules/**',
      '**/target/**',
      '**/coverage/**',
      '**/.git/**',
      '**/.codex/**',
      '**/.claude/**',
      '**/.cursor/**',
    ],
  });
}

/**
 * Semantic errors a bundler rejects but a parser accepts, chiefly `export { x }` for an `x` this
 * module never declares. Syntax alone cannot catch a decl the migration pass moved out from under
 * its own re-export. `lang` is forced because emitted modules keep their `.tsx` path while holding
 * JS, and TS dialects excuse an undeclared export as a possible type re-export.
 */
function semanticErrorsIn(path: string, code: string): string[] {
  return parseSync(path, code, { lang: 'jsx', showSemanticErrors: true }).errors.map(
    (e) => e.message
  );
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
  for (const relPath of sourceFiles()) {
    const code = readFileSync(`${REPO_ROOT}/${relPath}`, 'utf-8');
    for (const isServer of [false, true]) {
      try {
        const result = transformModule({
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
        for (const emitted of result.modules) {
          for (const message of semanticErrorsIn(emitted.path, emitted.code)) {
            failures.push(`${relPath} (isServer=${isServer}) -> ${emitted.path}: ${message}`);
          }
        }
        transformed++;
      } catch (err) {
        failures.push(`${relPath} (isServer=${isServer}): ${(err as Error).message}`);
      }
    }
  }
  expect(failures).toEqual([]);
  expect(transformed).toBeGreaterThan(1000);
}, 300_000);
