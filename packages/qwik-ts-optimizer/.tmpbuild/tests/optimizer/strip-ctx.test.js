import { describe, expect, it } from 'vitest';
import { isStrippedSegment, generateStrippedSegmentCode, } from '../../src/optimizer/strip-ctx.js';
describe('strip-ctx', () => {
    // -------------------------------------------------------------------------
    // isStrippedSegment
    // -------------------------------------------------------------------------
    describe('isStrippedSegment', () => {
        it('returns true when ctxName starts with a stripCtxName prefix', () => {
            expect(isStrippedSegment('serverStuff', 'function', ['server'])).toBe(true);
        });
        it('returns true when ctxName matches exactly', () => {
            expect(isStrippedSegment('server', 'function', ['server'])).toBe(true);
        });
        it('returns false when ctxName does not match any prefix', () => {
            expect(isStrippedSegment('component', 'function', ['server'])).toBe(false);
        });
        it('returns false when stripCtxName is undefined', () => {
            expect(isStrippedSegment('serverStuff', 'function', undefined)).toBe(false);
        });
        it('returns false when stripCtxName is empty array', () => {
            expect(isStrippedSegment('serverStuff', 'function', [])).toBe(false);
        });
        it('matches multiple prefixes', () => {
            expect(isStrippedSegment('clientOnly', 'function', ['server', 'client'])).toBe(true);
            expect(isStrippedSegment('serverCall', 'function', ['server', 'client'])).toBe(true);
            expect(isStrippedSegment('otherFunc', 'function', ['server', 'client'])).toBe(false);
        });
        it('returns true when stripEventHandlers and ctxKind is eventHandler', () => {
            expect(isStrippedSegment('onClick', 'eventHandler', undefined, true)).toBe(true);
        });
        it('returns false when stripEventHandlers and ctxKind is not eventHandler', () => {
            expect(isStrippedSegment('component', 'function', undefined, true)).toBe(false);
        });
        it('returns true when both stripCtxName matches AND stripEventHandlers matches', () => {
            expect(isStrippedSegment('serverClick', 'eventHandler', ['server'], true)).toBe(true);
        });
        it('returns false when neither matches', () => {
            expect(isStrippedSegment('component', 'function', ['server'], false)).toBe(false);
        });
    });
    // -------------------------------------------------------------------------
    // generateStrippedSegmentCode
    // -------------------------------------------------------------------------
    describe('generateStrippedSegmentCode', () => {
        it('generates null export for symbol name', () => {
            expect(generateStrippedSegmentCode('s_r1qAHX7Opp0')).toBe('export const s_r1qAHX7Opp0 = null;');
        });
        it('generates null export for different symbol name', () => {
            expect(generateStrippedSegmentCode('s_ddV1irobfWI')).toBe('export const s_ddV1irobfWI = null;');
        });
    });
});
//# sourceMappingURL=strip-ctx.test.js.map