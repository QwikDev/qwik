/**
 * Diagnostic: dump the actual cleaned AST diffs for failing tests
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

// Minimal stripPositions for diagnostic
function strip(node: any): any {
  if (Array.isArray(node)) return node.map(strip);
  if (node === null || typeof node !== 'object') return node;
  if (node.type === 'ParenthesizedExpression' && node.expression) return strip(node.expression);
  const cleaned: Record<string, any> = {};
  for (const [key, value] of Object.entries(node)) {
    if (['start', 'end', 'loc', 'range', 'shorthand', 'typeAnnotation', 'returnType', 'typeParameters', 'typeArguments'].includes(key)) continue;
    if (key === 'decorators' && Array.isArray(value) && (value as any[]).length === 0) continue;
    if (key === 'optional' && value === false) continue;
    if (key === 'raw') continue; // strip all raw
    cleaned[key] = strip(value);
  }
  return cleaned;
}

function deepDiff(a: any, b: any, path: string = ''): string[] {
  if (a === b) return [];
  if (a === null || b === null || typeof a !== typeof b) {
    return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    const diffs: string[] = [];
    const maxLen = Math.max(a.length, b.length);
    if (a.length !== b.length) {
      diffs.push(`${path}.length: ${a.length} vs ${b.length}`);
    }
    for (let i = 0; i < Math.min(maxLen, 5); i++) {
      diffs.push(...deepDiff(a[i], b[i], `${path}[${i}]`));
    }
    return diffs;
  }
  if (typeof a === 'object') {
    const diffs: string[] = [];
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of allKeys) {
      if (!(key in a)) {
        diffs.push(`${path}.${key}: MISSING vs ${JSON.stringify(b[key])?.slice(0, 80)}`);
      } else if (!(key in b)) {
        diffs.push(`${path}.${key}: ${JSON.stringify(a[key])?.slice(0, 80)} vs MISSING`);
      } else {
        diffs.push(...deepDiff(a[key], b[key], `${path}.${key}`));
      }
      if (diffs.length > 20) break;
    }
    return diffs;
  }
  return [`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`];
}

// Tests where segments exist and match in name but AST differs
const TESTS_TO_CHECK = [
  'example_8',
  'example_9',
  'example_capturing_fn_class',
  'destructure_args_colon_props',
  'destructure_args_inline_cmp_block_stmt',
];

describe('diagnose AST diffs', () => {
  for (const testName of TESTS_TO_CHECK) {
    it(`ast-diff: ${testName}`, () => {
      const snapFile = `qwik_core__test__${testName}.snap`;
      const fullPath = join(SNAP_DIR, snapFile);
      let content: string;
      try { content = readFileSync(fullPath, 'utf-8'); } catch { return; }

      const parsed = parseSnapshot(content);
      if (!parsed.input) return;

      const options = getSnapshotTransformOptions(testName, parsed.input);
      const result = transformModule(options);

      // Check parent module
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (act) {
          const expAst = strip(parseSync(exp.filename || 'test.tsx', exp.code).program);
          const actAst = strip(parseSync(exp.filename || 'test.tsx', act.code).program);
          if (!equal(expAst, actAst)) {
            const diffs = deepDiff(expAst, actAst, 'parent');
            console.log(`\n=== ${testName} PARENT AST DIFFS (first 15) ===`);
            for (const d of diffs.slice(0, 15)) console.log(`  ${d}`);
          }
        }
      }

      // Check segments
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find(
          (m) => m.segment && m.segment.name === expectedSeg.metadata!.name,
        );
        if (!actualSeg || !actualSeg.code || !expectedSeg.code) continue;

        const fn = expectedSeg.filename || 'test.tsx';
        const expAst = strip(parseSync(fn, expectedSeg.code).program);
        const actAst = strip(parseSync(fn, actualSeg.code).program);
        if (!equal(expAst, actAst)) {
          const diffs = deepDiff(expAst, actAst, `seg:${expectedSeg.metadata.name}`);
          console.log(`\n=== ${testName} SEGMENT ${expectedSeg.metadata.name} AST DIFFS (first 15) ===`);
          for (const d of diffs.slice(0, 15)) console.log(`  ${d}`);
        }
      }
    });
  }
});
