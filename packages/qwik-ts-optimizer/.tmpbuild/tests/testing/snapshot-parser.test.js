import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSnapshot } from '../../src/testing/snapshot-parser.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
const SNAPS_DIR = join(__dirname, '../../match-these-snaps');
function loadSnap(name) {
    return readFileSync(join(SNAPS_DIR, name), 'utf-8');
}
describe('parseSnapshot', () => {
    describe('example_1.snap', () => {
        let result;
        it('parses without error', () => {
            result = parseSnapshot(loadSnap('qwik_core__test__example_1.snap'));
        });
        it('extracts frontmatter', () => {
            expect(result.frontmatter.source).toBe('packages/optimizer/core/src/test.rs');
            expect(result.frontmatter.assertionLine).toBe(92);
            expect(result.frontmatter.expression).toBe('output');
        });
        it('extracts input section', () => {
            expect(result.input).not.toBeNull();
            expect(result.input).toContain('import { $, component, onRender }');
            expect(result.input).toContain('export const renderHeader1');
        });
        it('finds 3 segments', () => {
            expect(result.segments).toHaveLength(3);
        });
        it('finds 1 parent module', () => {
            expect(result.parentModules).toHaveLength(1);
        });
        it('has empty diagnostics', () => {
            expect(result.diagnostics).toEqual([]);
        });
        it('extracts segment[0] metadata correctly', () => {
            const meta = result.segments[0].metadata;
            expect(meta).not.toBeNull();
            expect(meta.name).toBe('renderHeader1_div_onClick_USi8k1jUb40');
            expect(meta.hash).toBe('USi8k1jUb40');
            expect(meta.displayName).toBe('test.tsx_renderHeader1_div_onClick');
            expect(meta.parent).toBe('renderHeader1_jMxQsjbyDss');
            expect(meta.origin).toBe('test.tsx');
            expect(meta.ctxKind).toBe('function');
            expect(meta.ctxName).toBe('$');
            expect(meta.captures).toBe(false);
            expect(meta.loc).toEqual([127, 152]);
            expect(meta.paramNames).toEqual(['ctx']);
        });
        it('extracts segment[0] code', () => {
            expect(result.segments[0].code).toContain('export const renderHeader1_div_onClick_USi8k1jUb40');
        });
        it('extracts segment[0] isEntryPoint', () => {
            expect(result.segments[0].isEntryPoint).toBe(true);
        });
        it('extracts segment[0] source map', () => {
            expect(result.segments[0].sourceMap).not.toBeNull();
            expect(result.segments[0].sourceMap).toContain('version');
        });
        it('extracts parent module correctly', () => {
            expect(result.parentModules[0].filename).toContain('test.tsx');
            expect(result.parentModules[0].code).toContain('import { qrl }');
            expect(result.parentModules[0].sourceMap).not.toBeNull();
        });
    });
    describe('relative_paths.snap (no INPUT section)', () => {
        let result;
        it('parses without error', () => {
            result = parseSnapshot(loadSnap('qwik_core__test__relative_paths.snap'));
        });
        it('has null input', () => {
            expect(result.input).toBeNull();
        });
        it('finds segments with metadata', () => {
            expect(result.segments.length).toBeGreaterThan(0);
            for (const seg of result.segments) {
                expect(seg.metadata).not.toBeNull();
            }
        });
        it('finds parent modules', () => {
            expect(result.parentModules.length).toBeGreaterThan(0);
        });
    });
    describe('example_capturing_fn_class.snap (has diagnostics)', () => {
        let result;
        it('parses without error', () => {
            result = parseSnapshot(loadSnap('qwik_core__test__example_capturing_fn_class.snap'));
        });
        it('has non-empty diagnostics', () => {
            expect(result.diagnostics.length).toBeGreaterThan(0);
            expect(result.diagnostics[0].category).toBe('error');
            expect(result.diagnostics[0].code).toBe('C02');
        });
    });
    describe('example_11.snap (segments without ENTRY POINT marker)', () => {
        let result;
        it('parses without error', () => {
            result = parseSnapshot(loadSnap('qwik_core__test__example_11.snap'));
        });
        it('finds segments (no ENTRY POINT in delimiter)', () => {
            expect(result.segments.length).toBeGreaterThan(0);
        });
        it('segments have isEntryPoint false when no marker', () => {
            for (const seg of result.segments) {
                expect(seg.isEntryPoint).toBe(false);
            }
        });
        it('segments have valid metadata', () => {
            for (const seg of result.segments) {
                expect(seg.metadata).not.toBeNull();
                expect(seg.metadata.hash).toBeTruthy();
            }
        });
    });
    describe('bulk validation: all 209 .snap files', () => {
        const snapFiles = readdirSync(SNAPS_DIR).filter((f) => f.endsWith('.snap'));
        it('finds 209 snapshot files', () => {
            expect(snapFiles).toHaveLength(209);
        });
        it('parses all 209 files without errors', () => {
            const errors = [];
            let totalSegments = 0;
            let totalParentModules = 0;
            for (const file of snapFiles) {
                try {
                    const content = readFileSync(join(SNAPS_DIR, file), 'utf-8');
                    const result = parseSnapshot(content);
                    // Verify structure
                    expect(result.frontmatter).toBeDefined();
                    expect(result.frontmatter.source).toBeTruthy();
                    expect(Array.isArray(result.segments)).toBe(true);
                    expect(Array.isArray(result.parentModules)).toBe(true);
                    expect(Array.isArray(result.diagnostics)).toBe(true);
                    // Verify all segments have valid metadata
                    for (const seg of result.segments) {
                        expect(seg.metadata).not.toBeNull();
                        expect(seg.metadata.name).toBeTruthy();
                        expect(seg.metadata.hash).toBeTruthy();
                        expect(seg.metadata.displayName).toBeTruthy();
                        expect(Array.isArray(seg.metadata.loc)).toBe(true);
                        expect(seg.metadata.loc).toHaveLength(2);
                    }
                    totalSegments += result.segments.length;
                    totalParentModules += result.parentModules.length;
                }
                catch (e) {
                    errors.push(`${file}: ${e.message}`);
                }
            }
            if (errors.length > 0) {
                throw new Error(`Failed to parse ${errors.length} files:\n${errors.join('\n')}`);
            }
            // Sanity check: we should have found a meaningful number of segments
            expect(totalSegments).toBeGreaterThan(100);
            expect(totalParentModules).toBeGreaterThan(50);
        });
    });
});
//# sourceMappingURL=snapshot-parser.test.js.map