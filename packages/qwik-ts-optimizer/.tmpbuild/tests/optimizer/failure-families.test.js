import { describe, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSync } from 'oxc-parser';
import equal from 'fast-deep-equal';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { transformModule } from '../../src/optimizer/transform.js';
import { getSnapshotTransformOptions } from './snapshot-options.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAP_DIR = join(__dirname, '../../match-these-snaps');
function strip(node, ancestors = []) {
    if (Array.isArray(node))
        return node.map((item) => strip(item, ancestors));
    if (node === null || typeof node !== 'object')
        return node;
    if (node.type === 'ParenthesizedExpression' && node.expression)
        return strip(node.expression, ancestors);
    const c = {};
    for (const [k, v] of Object.entries(node)) {
        if (k === 'start' || k === 'end' || k === 'loc' || k === 'range')
            continue;
        if (k === 'raw' && (node?.type === 'Literal' || node?.type === 'JSXText' ||
            (ancestors[0]?.type === 'TemplateElement' && ancestors[1]?.type === 'TemplateLiteral' && ancestors[2]?.type !== 'TaggedTemplateExpression')))
            continue;
        c[k] = strip(v, [node, ...ancestors].slice(0, 3));
    }
    return c;
}
describe('failure families', () => {
    it('categorizes all 209 snapshots into ordered families', () => {
        const files = readdirSync(SNAP_DIR).filter(f => f.endsWith('.snap')).sort();
        const alreadyPassing = [];
        const parentRewriteOnly = []; // segments match, parent wrong
        const untransformed = []; // extraction not happening
        const segmentIdentity = []; // wrong segment names
        const segmentCodegen = []; // segment found but code wrong
        const noInput = [];
        for (const f of files) {
            const name = f.replace('qwik_core__test__', '').replace('.snap', '');
            const snap = readFileSync(join(SNAP_DIR, f), 'utf-8');
            const parsed = parseSnapshot(snap);
            if (!parsed.input) {
                noInput.push(name);
                continue;
            }
            let result;
            try {
                const opts = getSnapshotTransformOptions(name, parsed.input);
                result = transformModule(opts);
            }
            catch {
                untransformed.push(name);
                continue;
            }
            // Check parent
            let parentOk = true;
            if (parsed.parentModules.length > 0) {
                try {
                    const ep = strip(parseSync('test.tsx', parsed.parentModules[0].code).program);
                    const ap = strip(parseSync('test.tsx', result.modules[0]?.code || '').program);
                    parentOk = equal(ep, ap);
                }
                catch {
                    parentOk = false;
                }
            }
            // Check segments
            let allSegsFound = true;
            let allSegsMatch = true;
            let anySegMissing = false;
            for (const es of parsed.segments) {
                if (!es.metadata)
                    continue;
                const as = result.modules.find(m => m.segment?.name === es.metadata.name);
                if (!as) {
                    anySegMissing = true;
                    allSegsFound = false;
                    continue;
                }
                if (es.code && as.code) {
                    try {
                        const ep = strip(parseSync('test.tsx', es.code).program);
                        const ap = strip(parseSync('test.tsx', as.code).program);
                        if (!equal(ep, ap))
                            allSegsMatch = false;
                    }
                    catch {
                        allSegsMatch = false;
                    }
                }
            }
            if (parentOk && allSegsFound && allSegsMatch) {
                alreadyPassing.push(name);
            }
            else if (allSegsFound && allSegsMatch && !parentOk) {
                parentRewriteOnly.push(name);
            }
            else if (anySegMissing && result.modules.filter(m => m.segment).length === 0) {
                untransformed.push(name);
            }
            else if (anySegMissing) {
                segmentIdentity.push(name);
            }
            else {
                segmentCodegen.push(name);
            }
        }
        console.log('\n=== FAILURE FAMILIES (ordered for convergence) ===\n');
        console.log(`ALREADY PASSING: ${alreadyPassing.length}`);
        alreadyPassing.forEach(n => console.log(`  ✓ ${n}`));
        console.log(`\nFAMILY 1 - Parent rewrite only (segments OK, parent wrong): ${parentRewriteOnly.length}`);
        parentRewriteOnly.forEach(n => console.log(`  - ${n}`));
        console.log(`\nFAMILY 2 - Untransformed (extraction not happening): ${untransformed.length}`);
        untransformed.forEach(n => console.log(`  - ${n}`));
        console.log(`\nFAMILY 3 - Segment identity (wrong names/hashes): ${segmentIdentity.length}`);
        segmentIdentity.forEach(n => console.log(`  - ${n}`));
        console.log(`\nFAMILY 4 - Segment codegen (found but code wrong): ${segmentCodegen.length}`);
        segmentCodegen.forEach(n => console.log(`  - ${n}`));
        console.log(`\nNO INPUT: ${noInput.length}`);
        noInput.forEach(n => console.log(`  - ${n}`));
        console.log(`\n=== SUMMARY ===`);
        console.log(`Already passing: ${alreadyPassing.length}`);
        console.log(`Family 1 (parent rewrite): ${parentRewriteOnly.length}`);
        console.log(`Family 2 (untransformed): ${untransformed.length}`);
        console.log(`Family 3 (segment identity): ${segmentIdentity.length}`);
        console.log(`Family 4 (segment codegen): ${segmentCodegen.length}`);
        console.log(`No input: ${noInput.length}`);
        console.log(`Total: ${alreadyPassing.length + parentRewriteOnly.length + untransformed.length + segmentIdentity.length + segmentCodegen.length + noInput.length}`);
    });
});
//# sourceMappingURL=failure-families.test.js.map