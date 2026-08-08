import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { TransformModulesOptions } from '@qwik.dev/optimizer';
import { transformModules } from './index';

/**
 * Native-readiness census over real-world code (specs/09): each corpus file compiles under
 * `nativeTarget` and reports its gap codes. Files listed as CLEAN must stay clean — moving a file
 * out of GAPS is progress; a clean file regressing fails loudly.
 */
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

const CLEAN: string[] = [
  'e2e/qwik-e2e/apps/vdomless-counter/src/root.tsx',
  'e2e/qwik-e2e/apps/todo-test/src/components/body/body.tsx',
  // `$()`-consts lower via qrl-const setup ops
  'starters/apps/playground/src/components/starter/counter/counter.tsx',
  // local Filter compiles as a local-component setup entry
  'e2e/qwik-e2e/apps/todo-test/src/components/footer/footer.tsx',
];

/**
 * Known gaps with exact expected codes — shrink these lists as coverage grows. Current gap
 * categories: router loaders/actions (specs/09 host-registered tier) and pre-existing scoped-style
 * handling.
 */
const GAPS: Record<string, string[]> = {
  // useListLoader()/useAddToListAction() — router loaders are host-registered under native
  'starters/apps/playground/src/routes/demo/todolist/index.tsx': [
    'native-custom-hook',
    'native-setup-statement',
    'native-setup-statement',
  ],
  // pre-existing scoped-style diagnostic in this single-file harness, not a native gap
  'starters/apps/playground/src/routes/demo/flower/index.tsx': ['scoped-style-content'],
};

describe('native readiness over real-world files', () => {
  for (const [path, expectedCodes] of [
    ...CLEAN.map((path) => [path, []] as const),
    ...Object.entries(GAPS),
  ]) {
    test(path, async () => {
      const code = readFileSync(join(repoRoot, path), 'utf-8');
      const result = await transformModules({
        input: [{ path: 'src/input.tsx', code }],
        srcDir: 'src',
        sourceMaps: false,
        transpileTs: true,
        transpileJsx: true,
        isServer: true,
        nativeTarget: 'rust',
      } as TransformModulesOptions & { nativeTarget: string });
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(expectedCodes);
    });
  }
});
