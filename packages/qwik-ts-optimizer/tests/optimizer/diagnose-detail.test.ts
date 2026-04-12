/**
 * Detailed diagnostic: show actual vs expected diffs for specific tests
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function runOne(testName: string) {
  const snapFile = `qwik_core__test__${testName}.snap`;
  const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
  const parsed = parseSnapshot(content);
  if (!parsed.input) return null;
  const options = getSnapshotTransformOptions(testName, parsed.input);
  const result = transformModule(options);
  return { parsed, result };
}

describe('detail diagnostics', () => {
  // Pick a few parent-only failures to understand the pattern
  const parentOnlyTests = [
    'example_input_bind',
    'example_derived_signals_children',
    'example_props_wrapping',
    'example_mutable_children',
  ];

  for (const testName of parentOnlyTests) {
    it(`parent diff: ${testName}`, () => {
      const data = runOne(testName);
      if (!data) return;
      const exp = data.parsed.parentModules[0];
      const act = data.result.modules[0];
      if (exp && act) {
        // Show first 80 chars of each line that differs
        const expLines = exp.code.split('\n');
        const actLines = act.code.split('\n');
        const diffs: string[] = [];
        const maxLines = Math.max(expLines.length, actLines.length);
        for (let i = 0; i < maxLines; i++) {
          const e = expLines[i] ?? '<missing>';
          const a = actLines[i] ?? '<missing>';
          if (e !== a) {
            diffs.push(`L${i+1}:\n  exp: ${e.slice(0,120)}\n  act: ${a.slice(0,120)}`);
          }
        }
        console.log(`\n=== PARENT DIFF: ${testName} (${diffs.length} lines differ) ===`);
        for (const d of diffs.slice(0, 15)) console.log(d);
        if (diffs.length > 15) console.log(`... and ${diffs.length - 15} more line diffs`);
      }
    });
  }

  // Pick segment-only failures
  const segOnlyTests = [
    'destructure_args_colon_props',
    'example_8',
    'example_class_name',
    'should_wrap_store_expression',
  ];

  for (const testName of segOnlyTests) {
    it(`segment diff: ${testName}`, () => {
      const data = runOne(testName);
      if (!data) return;
      for (const expectedSeg of data.parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = data.result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) { console.log(`\n=== MISSING SEGMENT: ${expectedSeg.metadata.name} in ${testName} ===`); continue; }
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          const expLines = expectedSeg.code.split('\n');
          const actLines = actualSeg.code.split('\n');
          const diffs: string[] = [];
          const maxLines = Math.max(expLines.length, actLines.length);
          for (let i = 0; i < maxLines; i++) {
            const e = expLines[i] ?? '<missing>';
            const a = actLines[i] ?? '<missing>';
            if (e.trim() !== a.trim()) {
              diffs.push(`L${i+1}:\n  exp: ${e.slice(0,150)}\n  act: ${a.slice(0,150)}`);
            }
          }
          console.log(`\n=== SEGMENT DIFF: ${expectedSeg.metadata.name} in ${testName} (${diffs.length} lines) ===`);
          for (const d of diffs.slice(0, 10)) console.log(d);
        }
      }
    });
  }
});
