import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { listFixtures, renderFixture } from './harness';

/**
 * Freshness gate for Layer-A shell goldens (spec 08). Regenerate with: `UPDATE_GOLDENS=1 pnpm
 * vitest run packages/compiler/conformance/layerA/layerA.unit.ts`
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const shouldUpdate = process.env.UPDATE_GOLDENS === '1';

describe('layerA shell goldens', () => {
  for (const name of listFixtures()) {
    test(name, async () => {
      const { html } = await renderFixture(name);
      const goldenFile = join(fixturesDir, name, 'expected', 'shell.html');
      if (shouldUpdate) {
        mkdirSync(dirname(goldenFile), { recursive: true });
        writeFileSync(goldenFile, html + '\n');
        return;
      }
      expect(
        readFileSync(goldenFile, 'utf-8'),
        `${name}/expected/shell.html is stale — regenerate goldens`
      ).toBe(html + '\n');
    });
  }
});
