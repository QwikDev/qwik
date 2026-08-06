import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from '../../src/index';

/**
 * Native-readiness gate (specs/09): every Layer-A fixture must compile clean under `nativeTarget`
 * except the listed known gaps. Shrinking this map is the migration metric; a fixture regressing
 * INTO it fails loudly.
 */
const KNOWN_GAPS: Record<string, string[]> = {
  // async component bodies (`await` setup statement) and fallback$ structural plans
  'suspense-inline': ['native-setup-statement', 'native-expression'],
  'suspense-stream': ['native-setup-statement', 'native-expression'],
};

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

describe('layerA native readiness', () => {
  for (const name of readdirSync(fixturesDir).sort()) {
    test(name, async () => {
      const dir = join(fixturesDir, name);
      const input = readdirSync(dir)
        .filter((file) => file.endsWith('.tsx'))
        .map((file) => ({ path: `src/${file}`, code: readFileSync(join(dir, file), 'utf-8') }));
      const result = await transformModules({
        input,
        srcDir: 'src',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        isServer: true,
        nativeTarget: 'rust',
      } as TransformModulesOptions & { nativeTarget: string });
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        KNOWN_GAPS[name] ?? []
      );
    });
  }
});
