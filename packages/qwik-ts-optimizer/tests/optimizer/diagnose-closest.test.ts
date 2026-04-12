/**
 * Find the tests closest to passing - smallest AST diffs
 */
import { describe, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { compareAst } from '../../src/testing/ast-compare.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotFiles } from '../../src/testing/batch-runner.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function stripPos(node: any): any {
  if (Array.isArray(node)) return node.map(stripPos);
  if (node === null || typeof node !== 'object') return node;
  if (node.type === 'ParenthesizedExpression' && node.expression) return stripPos(node.expression);
  const c: Record<string, any> = {};
  for (const [k, v] of Object.entries(node)) {
    if (['start','end','loc','range','shorthand','typeAnnotation','returnType','typeParameters','typeArguments'].includes(k)) continue;
    if (k === 'raw' && (node.type === 'Literal' || node.type === 'JSXText')) continue;
    c[k] = stripPos(v);
  }
  return c;
}

function normalizeImports(program: any): void {
  if (!program?.body) return;
  let i = 0;
  while (i < program.body.length && program.body[i]?.type === 'ImportDeclaration') i++;
  if (i <= 1) return;
  const imports = program.body.slice(0, i);
  imports.sort((a: any, b: any) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  program.body.splice(0, i, ...imports);
}

function countDiffStatements(code1: string, code2: string, filename: string): number {
  try {
    const ast1 = stripPos(parseSync(filename, code1).program);
    const ast2 = stripPos(parseSync(filename, code2).program);
    normalizeImports(ast1);
    normalizeImports(ast2);
    const body1 = ast1?.body || [];
    const body2 = ast2?.body || [];
    let diffs = 0;
    const max = Math.max(body1.length, body2.length);
    for (let i = 0; i < max; i++) {
      if (!equal(body1[i], body2[i])) diffs++;
    }
    return diffs;
  } catch { return 999; }
}

describe('closest to passing', () => {
  it('rank', () => {
    const allFiles = getSnapshotFiles(SNAP_DIR);
    const testScores: Array<{testName: string; totalDiffs: number; details: string}> = [];

    for (const snapFile of allFiles) {
      const testName = snapFile.replace('qwik_core__test__', '').replace('.snap', '');
      const content = readFileSync(join(SNAP_DIR, snapFile), 'utf-8');
      const parsed = parseSnapshot(content);
      if (!parsed.input) continue;
      const options = getSnapshotTransformOptions(testName, parsed.input);
      let result: any;
      try { result = transformModule(options); } catch { testScores.push({testName, totalDiffs: 999, details: 'THROW'}); continue; }

      let totalDiffs = 0;
      let details: string[] = [];
      let allMatch = true;

      // Check parent
      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0];
        const act = result.modules[0];
        if (!act) { totalDiffs += 100; details.push('no-parent'); allMatch = false; }
        else {
          const r = compareAst(exp.code, act.code, exp.filename || 'test.tsx');
          if (!r.match) {
            const d = countDiffStatements(exp.code, act.code, exp.filename || 'test.tsx');
            totalDiffs += d;
            details.push(`parent:${d}`);
            allMatch = false;
          }
        }
      }

      // Check segments
      for (const expectedSeg of parsed.segments) {
        if (!expectedSeg.metadata) continue;
        const actualSeg = result.modules.find((m: any) => m.segment && m.segment.name === expectedSeg.metadata!.name);
        if (!actualSeg) { totalDiffs += 50; details.push(`missing:${expectedSeg.metadata.name}`); allMatch = false; continue; }
        const r = compareAst(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
        if (!r.match) {
          const d = countDiffStatements(expectedSeg.code, actualSeg.code, expectedSeg.filename || 'test.tsx');
          totalDiffs += d;
          details.push(`seg:${expectedSeg.metadata.name.split('_').pop()}=${d}`);
          allMatch = false;
        }
        // Check metadata
        if (actualSeg.segment && expectedSeg.metadata) {
          const a = actualSeg.segment, e = expectedSeg.metadata;
          if (a.ctxKind !== e.ctxKind || a.captures !== e.captures) {
            totalDiffs += 1;
            details.push('meta');
          }
        }
      }

      if (!allMatch) {
        testScores.push({testName, totalDiffs, details: details.join(' ')});
      }
    }

    testScores.sort((a, b) => a.totalDiffs - b.totalDiffs);
    console.log('\n=== CLOSEST TO PASSING (lowest diff score) ===');
    for (const t of testScores.slice(0, 40)) {
      console.log(`  [${t.totalDiffs}] ${t.testName}: ${t.details}`);
    }
  });
});
