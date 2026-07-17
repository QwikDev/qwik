import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform/index.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
import { stripAstPositions, isRecord } from './helpers/ast-normalize.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');

function bodyOf(program: unknown): readonly unknown[] {
  if (isRecord(program) && Array.isArray(program.body)) return program.body;
  return [];
}

describe('convergence breakdown', () => {
  it('categorizes all failures', () => {
    const files = readdirSync(SNAP_DIR).filter(f => f.endsWith('.snap')).sort();

    let parentPass = 0, parentFail = 0, noInput = 0, parseError = 0;
    let segPass = 0, segFail = 0, segMissing = 0;
    const categories: Record<string, string[]> = {
      'off-by-1': [],
      'mostly-matching': [],
      'major-diff': [],
      'parse-error': [],
    };

    for (const f of files) {
      const name = f.replace('qwik_core__test__','').replace('.snap','');
      const snap = readFileSync(join(SNAP_DIR, f), 'utf-8');
      const parsed = parseSnapshot(snap);
      if (!parsed.input) { noInput++; continue; }

      let result;
      try {
        const opts = getSnapshotTransformOptions(name, parsed.input);
        result = transformModule(opts);
      } catch { parentFail++; categories['parse-error'].push(name); continue; }

      if (parsed.parentModules.length > 0) {
        const exp = parsed.parentModules[0].code;
        const act = result.modules[0]?.code || '';
        try {
          const ep = stripAstPositions(parseSync('test.tsx', exp).program);
          const ap = stripAstPositions(parseSync('test.tsx', act).program);
          if (equal(ep, ap)) {
            parentPass++;
          } else {
            parentFail++;
            const epBody = bodyOf(ep);
            const apBody = bodyOf(ap);
            const matchCount = epBody.filter((s, i) => equal(s, apBody[i])).length;
            const total = Math.max(epBody.length, apBody.length);
            if (matchCount >= total - 1) categories['off-by-1'].push(name);
            else if (matchCount >= total * 0.7) categories['mostly-matching'].push(name);
            else categories['major-diff'].push(name);
          }
        } catch {
          parentFail++;
          categories['parse-error'].push(name);
        }
      }

      for (const es of parsed.segments) {
        if (!es.metadata) continue;
        const as = result.modules.find(m => m.kind === 'segment' && m.segment.name === es.metadata!.name);
        if (!as) { segMissing++; continue; }
        if (es.code && as.code) {
          try {
            const ep = stripAstPositions(parseSync('test.tsx', es.code).program);
            const ap = stripAstPositions(parseSync('test.tsx', as.code).program);
            if (equal(ep, ap)) segPass++; else segFail++;
          } catch { segFail++; }
        }
      }
    }

    console.log('\n=== CONVERGENCE BREAKDOWN ===');
    console.log(`Parent: ${parentPass} pass / ${parentFail} fail / ${noInput} no-input`);
    console.log(`Segments: ${segPass} pass / ${segFail} fail / ${segMissing} missing-by-name`);
    console.log(`\nParent failure categories:`);
    console.log(`  off-by-1-stmt (close!): ${categories['off-by-1'].length}`);
    categories['off-by-1'].slice(0, 10).forEach(n => console.log(`    - ${n}`));
    console.log(`  mostly-matching (70%+): ${categories['mostly-matching'].length}`);
    categories['mostly-matching'].slice(0, 10).forEach(n => console.log(`    - ${n}`));
    console.log(`  major-diff (<70%): ${categories['major-diff'].length}`);
    categories['major-diff'].slice(0, 10).forEach(n => console.log(`    - ${n}`));
    console.log(`  parse-error: ${categories['parse-error'].length}`);
    categories['parse-error'].slice(0, 5).forEach(n => console.log(`    - ${n}`));
  });
});
