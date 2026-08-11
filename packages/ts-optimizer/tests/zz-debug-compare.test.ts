// Ad-hoc debugging aid: SNAP=<test name> pnpm vitest run tests/zz-debug-compare.test.ts
// Prints per-module compare results and code for the mismatching modules.
import { it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSnapshot } from '../src/testing/snapshot-parser.js';
import { compareAst } from '../src/testing/ast-compare.js';
import { transformModule } from '../src/optimizer/transform/index.js';
import { SNAP_DIR } from './rust-snapshots.js';
import { getSnapshotTransformOptions } from './optimizer/snapshot-options.js';

const name = process.env.SNAP;

it.runIf(name)(`debug ${name}`, () => {
  const content = readFileSync(join(SNAP_DIR, `qwik_core__test__${name}.snap`), 'utf-8');
  const parsed = parseSnapshot(content);
  const options = getSnapshotTransformOptions(name!, parsed.input!);
  const result = transformModule(options);

  const expectedParent = parsed.parentModules[0];
  const actualParent = result.modules[0];
  if (expectedParent && actualParent) {
    const r = compareAst(
      expectedParent.code,
      actualParent.code,
      expectedParent.filename || 'test.tsx'
    );
    console.log(
      `PARENT match=${r.match} expErr=${r.expectedParseError} actErr=${r.actualParseError}`
    );
    if (!r.match) {
      console.log('--- EXPECTED PARENT ---\n' + expectedParent.code);
      console.log('--- ACTUAL PARENT ---\n' + actualParent.code);
    }
  }
  for (const seg of parsed.segments) {
    if (!seg.metadata) continue;
    const actual = result.modules.find(
      (m) => m.kind === 'segment' && m.segment.name === seg.metadata!.name
    );
    if (!actual) {
      console.log(`SEGMENT ${seg.metadata.name}: MISSING in TS output`);
      continue;
    }
    const r = compareAst(seg.code, actual.code, seg.filename || 'test.tsx');
    const metaDiffs: string[] = [];
    if (actual.kind === 'segment') {
      const a = actual.segment as unknown as Record<string, unknown>;
      const e = seg.metadata as unknown as Record<string, unknown>;
      for (const k of [
        'origin',
        'name',
        'displayName',
        'hash',
        'canonicalFilename',
        'ctxKind',
        'ctxName',
        'captures',
      ]) {
        if (a[k] !== e[k]) metaDiffs.push(`${k}: expected ${e[k]} got ${a[k]}`);
      }
    }
    console.log(`SEGMENT ${seg.metadata.name}: code=${r.match} meta=[${metaDiffs.join('; ')}]`);
    if (!r.match) {
      console.log('--- EXPECTED SEG ---\n' + seg.code);
      console.log('--- ACTUAL SEG ---\n' + actual.code);
    }
  }
});
