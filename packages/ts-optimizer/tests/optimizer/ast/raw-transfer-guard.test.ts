import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const srcDir = fileURLToPath(new URL('../../../src/', import.meta.url));
const RAW_TRANSFER_TOKENS = ['RAW_TRANSFER_PARSER_OPTIONS', 'experimentalRawTransfer'];
// The option lives in ast-types.ts; parse.ts is the one call site allowed to pass it to oxc.
const ALLOWED_FILES = new Set(['ast-types.ts', join('optimizer', 'ast', 'parse.ts')]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listSourceFiles(entryPath);
    }
    return entry.name.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('raw-transfer parsing', () => {
  // disableRawTransfer() only reaches parses that go through parseWithRawTransfer; a direct
  // raw-transfer parseSync reserves its own 6 GB buffer, in pool workers too.
  it('only reaches oxc through parseWithRawTransfer', () => {
    const offenders = listSourceFiles(srcDir)
      .map((file) => relative(srcDir, file))
      .filter((rel) => !ALLOWED_FILES.has(rel))
      .filter((rel) => {
        const source = readFileSync(join(srcDir, rel), 'utf8');
        return RAW_TRANSFER_TOKENS.some((token) => source.includes(token));
      });
    expect(offenders).toEqual([]);
  });
});
