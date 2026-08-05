import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import {
  buildCoerceCorpus,
  buildEscapeCorpus,
  buildJsonBytesCorpus,
  buildNumbersCorpus,
  buildSerdesCorpus,
  buildToFixedCorpus,
} from './corpora';

/**
 * Freshness gate for the committed Layer-0 goldens (spec 08). Regenerate with: `UPDATE_GOLDENS=1
 * pnpm vitest run packages/compiler/conformance/layer0/layer0.unit.ts`
 */
const goldensDir = join(dirname(fileURLToPath(import.meta.url)), 'goldens');
const shouldUpdate = process.env.UPDATE_GOLDENS === '1';

const verifyGolden = (name: string, corpus: unknown) => {
  const file = join(goldensDir, `${name}.json`);
  const generated = JSON.stringify(corpus) + '\n';
  if (shouldUpdate) {
    mkdirSync(goldensDir, { recursive: true });
    writeFileSync(file, generated);
    return;
  }
  expect(readFileSync(file, 'utf-8'), `${name}.json is stale — regenerate goldens`).toBe(generated);
};

describe('layer0 conformance goldens', () => {
  test('numbers', () => verifyGolden('numbers', buildNumbersCorpus()));
  test('tofixed', () => verifyGolden('tofixed', buildToFixedCorpus()));
  test('json-bytes', () => verifyGolden('json-bytes', buildJsonBytesCorpus()));
  test('escape', () => verifyGolden('escape', buildEscapeCorpus()));
  test('coerce', () => verifyGolden('coerce', buildCoerceCorpus()));
  test('serdes', async () => verifyGolden('serdes', await buildSerdesCorpus()));
});
