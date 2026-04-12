/**
 * Diagnostic test: dump AST differences for specific failing convergence tests
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
import { parseSync } from 'oxc-parser';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function getTestName(snapFilename: string): string {
  return snapFilename.replace('qwik_core__test__', '').replace('.snap', '');
}

// Pick a diverse sample of failing tests
const FAILING_TESTS = [
  'example_5',
  'destructure_args_colon_props',
  'example_capture_imports',
  'example_build_server',
  'example_derived_signals_children',
  'example_8',
  'example_9',
  'example_capturing_fn_class',
  'example_dev_mode',
  'example_component_with_event_listeners_inside_loop',
];

function simpleParse(code: string, filename: string) {
  const result = parseSync(filename, code);
  return JSON.parse(JSON.stringify(result.program));
}

describe('diagnose failing tests', () => {
  for (const testName of FAILING_TESTS) {
    it(`diagnose: ${testName}`, () => {
      const snapFile = `qwik_core__test__${testName}.snap`;
      const fullPath = join(SNAP_DIR, snapFile);

      let content: string;
      try {
        content = readFileSync(fullPath, 'utf-8');
      } catch {
        console.log(`SKIP: ${testName} - snap file not found`);
        return;
      }

      const parsed = parseSnapshot(content);
      if (!parsed.input) {
        console.log(`SKIP: ${testName} - no input`);
        return;
      }

      const options = getSnapshotTransformOptions(testName, parsed.input);
      const result = transformModule(options);

      // Compare parent modules
      if (parsed.parentModules.length > 0) {
        const expectedParent = parsed.parentModules[0];
        const actualParent = result.modules[0];
        if (actualParent) {
          console.log(`\n=== ${testName} PARENT MODULE ===`);
          console.log(`--- EXPECTED (first 500 chars) ---`);
          console.log(expectedParent.code.slice(0, 500));
          console.log(`--- ACTUAL (first 500 chars) ---`);
          console.log(actualParent.code.slice(0, 500));
        }
      }

      // Compare segments
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find(
          (m) => m.segment && m.segment.name === expectedSeg.metadata!.name,
        );
        if (!actualSeg) {
          console.log(`\n=== ${testName} MISSING SEGMENT: ${expectedSeg.metadata.name} ===`);
          continue;
        }
        if (actualSeg.code && expectedSeg.code) {
          // Just show the raw code diffs
          const expLines = expectedSeg.code.split('\n');
          const actLines = actualSeg.code.split('\n');

          let hasDiff = false;
          for (let i = 0; i < Math.max(expLines.length, actLines.length); i++) {
            if (expLines[i] !== actLines[i]) {
              if (!hasDiff) {
                console.log(`\n=== ${testName} SEGMENT ${expectedSeg.metadata.name} DIFFS ===`);
                hasDiff = true;
              }
              console.log(`  line ${i + 1}:`);
              console.log(`    EXP: ${expLines[i] ?? '(missing)'}`);
              console.log(`    ACT: ${actLines[i] ?? '(missing)'}`);
            }
          }
        }

        // Check metadata
        if (actualSeg.segment && expectedSeg.metadata) {
          const a = actualSeg.segment;
          const e = expectedSeg.metadata;
          const metaDiffs: string[] = [];
          if (a.origin !== e.origin) metaDiffs.push(`origin: ${e.origin} vs ${a.origin}`);
          if (a.name !== e.name) metaDiffs.push(`name: ${e.name} vs ${a.name}`);
          if (a.hash !== e.hash) metaDiffs.push(`hash: ${e.hash} vs ${a.hash}`);
          if (a.captures !== e.captures) metaDiffs.push(`captures: ${e.captures} vs ${a.captures}`);
          if (a.ctxKind !== e.ctxKind) metaDiffs.push(`ctxKind: ${e.ctxKind} vs ${a.ctxKind}`);
          if (a.ctxName !== e.ctxName) metaDiffs.push(`ctxName: ${e.ctxName} vs ${a.ctxName}`);
          if (metaDiffs.length) {
            console.log(`  METADATA DIFFS: ${metaDiffs.join(', ')}`);
          }
        }
      }
    });
  }
});
