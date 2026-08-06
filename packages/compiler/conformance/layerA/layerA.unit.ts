import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { listFixtures, readFixtureRequest, renderFixture, renderFixtureRoot } from './harness';
import { buildInterpretedRoot } from './interpret-plan';

/**
 * Freshness gate for Layer-A shell goldens (spec 08). Regenerate with: `UPDATE_GOLDENS=1 pnpm
 * vitest run packages/compiler/conformance/layerA/layerA.unit.ts`
 */
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const shouldUpdate = process.env.UPDATE_GOLDENS === '1';

describe('layerA shell goldens', () => {
  for (const name of listFixtures()) {
    test(name, async () => {
      const { html, chunks, plan } = await renderFixture(name);
      const goldens: [string, string][] = [
        ['shell.html', html + '\n'],
        ['plan.json', JSON.stringify(plan, null, 2) + '\n'],
      ];
      if (chunks !== undefined) {
        goldens.push(['stream.json', JSON.stringify(chunks, null, 2) + '\n']);
      }
      for (const [file, content] of goldens) {
        const goldenFile = join(fixturesDir, name, 'expected', file);
        if (shouldUpdate) {
          mkdirSync(dirname(goldenFile), { recursive: true });
          writeFileSync(goldenFile, content);
          continue;
        }
        expect(
          readFileSync(goldenFile, 'utf-8'),
          `${name}/expected/${file} is stale — regenerate goldens`
        ).toBe(content);
      }
    });
  }
});

describe('layerA reference interpreter parity', () => {
  for (const name of listFixtures()) {
    test(name, async () => {
      // renderFixture also writes the generated segment modules the interpreter resolves
      const { plan } = await renderFixture(name);
      const request = readFixtureRequest(name);
      const root = await buildInterpretedRoot(
        plan,
        (chunkFile) => import(`./.generated/${name}/src/${chunkFile}`)
      );
      const { html, chunks } = await renderFixtureRoot(root as never, request);
      expect(html + '\n').toBe(
        readFileSync(join(fixturesDir, name, 'expected', 'shell.html'), 'utf-8')
      );
      if (chunks !== undefined) {
        expect(JSON.stringify(chunks, null, 2) + '\n').toBe(
          readFileSync(join(fixturesDir, name, 'expected', 'stream.json'), 'utf-8')
        );
      }
    });
  }
});
