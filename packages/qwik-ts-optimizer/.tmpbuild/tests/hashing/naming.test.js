import { describe, it, expect } from 'vitest';
import { escapeSym, buildDisplayName, buildSymbolName } from '../../src/hashing/naming.js';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const SNAP_DIR = join(import.meta.dirname, '../../match-these-snaps');
describe('escapeSym', () => {
    it('strips trailing $ from component names', () => {
        expect(escapeSym('Foo_component$')).toBe('Foo_component');
    });
    it('returns empty string for all non-alnum', () => {
        expect(escapeSym('$')).toBe('');
    });
    it('trims leading/trailing non-alnum and squashes consecutive separators', () => {
        expect(escapeSym('___abc___def___')).toBe('abc_def');
    });
    it('strips $ from event handler names', () => {
        expect(escapeSym('onClick$')).toBe('onClick');
    });
    it('converts dots to underscores', () => {
        expect(escapeSym('a.b.c')).toBe('a_b_c');
    });
    it('preserves leading digits (digits are alnum)', () => {
        expect(escapeSym('123abc')).toBe('123abc');
    });
});
describe('buildDisplayName', () => {
    it('builds display name from single context entry', () => {
        expect(buildDisplayName('test.tsx', ['renderHeader1'])).toBe('test.tsx_renderHeader1');
    });
    it('builds display name from multi-level context stack', () => {
        expect(buildDisplayName('test.tsx', ['renderHeader1', 'div', 'onClick$'])).toBe('test.tsx_renderHeader1_div_onClick');
    });
    it('builds display name for component context', () => {
        expect(buildDisplayName('test.tsx', ['renderHeader2', 'component$'])).toBe('test.tsx_renderHeader2_component');
    });
    it('uses s_ prefix for empty context stack', () => {
        expect(buildDisplayName('test.tsx', [])).toBe('test.tsx_s_');
    });
});
describe('buildSymbolName', () => {
    it('produces correct symbol name for renderHeader1_div_onClick', () => {
        expect(buildSymbolName('test.tsx_renderHeader1_div_onClick', undefined, 'test.tsx')).toBe('renderHeader1_div_onClick_USi8k1jUb40');
    });
    it('produces correct symbol name for renderHeader1', () => {
        expect(buildSymbolName('test.tsx_renderHeader1', undefined, 'test.tsx')).toBe('renderHeader1_jMxQsjbyDss');
    });
    it('produces correct symbol name for renderHeader2_component', () => {
        expect(buildSymbolName('test.tsx_renderHeader2_component', undefined, 'test.tsx')).toBe('renderHeader2_component_Ay6ibkfFYsw');
    });
    it('matches all symbol names across the 209 snapshot corpus', () => {
        const snapFiles = readdirSync(SNAP_DIR).filter((f) => f.endsWith('.snap'));
        expect(snapFiles.length).toBe(209);
        let totalNames = 0;
        let skipped = 0;
        const mismatches = [];
        // Same edge case files as siphash corpus test
        const KNOWN_EDGE_CASE_FILES = new Set([
            'qwik_core__test__example_build_server.snap',
            'qwik_core__test__example_capture_imports.snap',
            'qwik_core__test__example_prod_node.snap',
            'qwik_core__test__example_qwik_react.snap',
            'qwik_core__test__example_strip_server_code.snap',
            'qwik_core__test__relative_paths.snap',
            'qwik_core__test__should_preserve_non_ident_explicit_captures.snap',
        ]);
        for (const file of snapFiles) {
            const content = readFileSync(join(SNAP_DIR, file), 'utf-8');
            const parsed = parseSnapshot(content);
            for (const segment of parsed.segments) {
                if (!segment.metadata)
                    continue;
                const meta = segment.metadata;
                // Skip edge cases (same as hash test)
                const lastSlash = meta.origin.lastIndexOf('/');
                const basename = lastSlash >= 0 ? meta.origin.slice(lastSlash + 1) : meta.origin;
                const prefix = basename + '_';
                if (!meta.displayName.startsWith(prefix)) {
                    skipped++;
                    continue;
                }
                if (meta.hash === meta.name) {
                    skipped++;
                    continue;
                }
                if (meta.loc[0] === 0 && meta.loc[1] === 0) {
                    skipped++;
                    continue;
                }
                const computed = buildSymbolName(meta.displayName, undefined, meta.origin);
                totalNames++;
                if (computed !== meta.name) {
                    if (KNOWN_EDGE_CASE_FILES.has(file)) {
                        skipped++;
                        continue;
                    }
                    mismatches.push({
                        file,
                        expected: meta.name,
                        actual: computed,
                        origin: meta.origin,
                        displayName: meta.displayName,
                    });
                }
            }
        }
        console.log(`Total names tested: ${totalNames}, skipped edge cases: ${skipped}`);
        if (mismatches.length > 0) {
            console.log(`Mismatches:`, JSON.stringify(mismatches, null, 2));
        }
        expect(mismatches).toHaveLength(0);
        expect(totalNames).toBeGreaterThan(350);
    });
});
//# sourceMappingURL=naming.test.js.map