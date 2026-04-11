/**
 * Debug test — shows exact actual vs expected output for failing snapshots.
 * Run with: npx vitest run tests/optimizer/debug-diff.test.ts
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

// Change this to debug a specific snapshot
const TARGET = 'example_1';

describe(`debug: ${TARGET}`, () => {
  it('shows actual vs expected diff', () => {
    const snap = readFileSync(
      join(SNAP_DIR, `qwik_core__test__${TARGET}.snap`),
      'utf-8',
    );
    const parsed = parseSnapshot(snap);
    if (!parsed.input) {
      console.log('NO INPUT in snapshot');
      return;
    }

    const opts = getSnapshotTransformOptions(TARGET, parsed.input);
    const result = transformModule(opts);

    // Parent module comparison
    if (parsed.parentModules.length > 0) {
      const expected = parsed.parentModules[0].code;
      const actual = result.modules[0]?.code ?? '';
      const cmp = compareAst(expected, actual, 'test.tsx');

      console.log('\n========== PARENT MODULE ==========');
      console.log('AST match:', cmp.match);
      if (cmp.expectedParseError) console.log('Expected parse error:', cmp.expectedParseError);
      if (cmp.actualParseError) console.log('Actual parse error:', cmp.actualParseError);

      if (!cmp.match) {
        console.log('\n--- EXPECTED ---');
        console.log(expected);
        console.log('\n--- ACTUAL ---');
        console.log(actual);

        // Line-by-line diff
        const expLines = expected.split('\n');
        const actLines = actual.split('\n');
        console.log('\n--- LINE DIFF ---');
        const maxLines = Math.max(expLines.length, actLines.length);
        for (let i = 0; i < maxLines; i++) {
          const e = expLines[i] ?? '<missing>';
          const a = actLines[i] ?? '<missing>';
          if (e !== a) {
            console.log(`LINE ${i + 1}:`);
            console.log(`  EXP: ${e}`);
            console.log(`  ACT: ${a}`);
          }
        }
      }
    }

    // Segment comparison
    console.log('\n========== SEGMENTS ==========');
    console.log('Expected:', parsed.segments.map(s => s.metadata?.name).filter(Boolean));
    console.log('Actual:', result.modules.filter(m => m.segment).map(m => m.segment!.name));

    for (const expectedSeg of parsed.segments) {
      if (!expectedSeg.metadata) continue;
      const actualSeg = result.modules.find(
        m => m.segment && m.segment.name === expectedSeg.metadata!.name,
      );

      if (!actualSeg) {
        console.log(`\nMISSING segment: ${expectedSeg.metadata.name}`);
        continue;
      }

      if (expectedSeg.code && actualSeg.code) {
        const segCmp = compareAst(expectedSeg.code, actualSeg.code, 'test.tsx');
        if (!segCmp.match) {
          console.log(`\nSEGMENT ${expectedSeg.metadata.name} - AST MISMATCH`);
          console.log('--- EXPECTED ---');
          console.log(expectedSeg.code);
          console.log('--- ACTUAL ---');
          console.log(actualSeg.code);
        } else {
          console.log(`\nSEGMENT ${expectedSeg.metadata.name} - AST OK`);
        }
      }
      // Compare metadata
      if (actualSeg.segment && expectedSeg.metadata) {
        const a = actualSeg.segment, e = expectedSeg.metadata;
        const fields = ['origin','name','displayName','hash','canonicalFilename','ctxKind','ctxName','captures'] as const;
        for (const f of fields) {
          if ((a as any)[f] !== (e as any)[f]) {
            console.log(`  META MISMATCH ${f}: expected=${JSON.stringify((e as any)[f])} actual=${JSON.stringify((a as any)[f])}`);
          }
        }
      }
    }
  });
});
