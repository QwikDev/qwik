/**
 * Tests for const-replacement module.
 *
 * Verifies that replaceConstants() replaces isServer/isBrowser/isDev identifiers
 * imported from qwik packages with boolean literals.
 */
import { describe, it, expect } from 'vitest';
import MagicString from 'magic-string';
import { parseSync } from 'oxc-parser';
import { replaceConstants } from '../../src/optimizer/const-replacement.js';
import { collectImports } from '../../src/optimizer/marker-detection.js';
function runReplace(source, isServer, isDev) {
    const { program } = parseSync('test.tsx', source);
    const s = new MagicString(source);
    const importMap = collectImports(program);
    const result = replaceConstants(source, s, program, importMap, isServer, isDev);
    return { code: s.toString(), ...result };
}
describe('replaceConstants', () => {
    it('replaces isServer with true and isBrowser with false when isServer=true', () => {
        const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
        const result = runReplace(source, true);
        expect(result.code).toContain('console.log(true, false)');
        expect(result.replacedCount).toBe(2);
    });
    it('replaces isServer with false and isBrowser with true when isServer=false', () => {
        const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
        const result = runReplace(source, false);
        expect(result.code).toContain('console.log(false, true)');
        expect(result.replacedCount).toBe(2);
    });
    it('does nothing when isServer is undefined', () => {
        const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
        const result = runReplace(source, undefined, undefined);
        expect(result.code).toContain('console.log(isServer, isBrowser)');
        expect(result.replacedCount).toBe(0);
    });
    it('replaces isDev with true when isDev=true', () => {
        const source = `import { isDev } from '@qwik.dev/core/build';
if (isDev) { console.log('dev'); }
`;
        const result = runReplace(source, undefined, true);
        expect(result.code).toContain('if (true)');
        expect(result.replacedCount).toBe(1);
    });
    it('replaces isDev with false when isDev=false', () => {
        const source = `import { isDev } from '@qwik.dev/core/build';
if (isDev) { console.log('dev'); }
`;
        const result = runReplace(source, undefined, false);
        expect(result.code).toContain('if (false)');
        expect(result.replacedCount).toBe(1);
    });
    it('does NOT replace user-defined isServer variable', () => {
        const source = `const isServer = true;
console.log(isServer);
`;
        const result = runReplace(source, true);
        // isServer here is not imported from qwik, so it should NOT be replaced
        expect(result.code).toBe(source);
        expect(result.replacedCount).toBe(0);
    });
    it('handles aliased imports (isServer as isServer2)', () => {
        const source = `import { isServer as isServer2 } from '@qwik.dev/core';
console.log(isServer2);
`;
        const result = runReplace(source, true);
        expect(result.code).toContain('console.log(true)');
        expect(result.replacedCount).toBe(1);
    });
    it('handles aliased isBrowser imports', () => {
        const source = `import { isBrowser as isb } from '@qwik.dev/core/build';
console.log(isb);
`;
        const result = runReplace(source, true);
        expect(result.code).toContain('console.log(false)');
        expect(result.replacedCount).toBe(1);
    });
    it('removes import statement for replaced identifiers', () => {
        const source = `import { isServer, isBrowser } from '@qwik.dev/core/build';
console.log(isServer, isBrowser);
`;
        const result = runReplace(source, true);
        expect(result.code).not.toContain("import { isServer, isBrowser }");
    });
    it('keeps non-replaced specifiers in a mixed import', () => {
        const source = `import { isServer, isBrowser, isDev } from '@qwik.dev/core/build';
console.log(isServer, isBrowser, isDev);
`;
        // Only replacing isServer/isBrowser (isServer=true), not isDev (isDev undefined)
        const result = runReplace(source, true, undefined);
        expect(result.code).toContain('console.log(true, false, isDev)');
        // isDev import should remain
        expect(result.code).toContain('isDev');
    });
    it('handles @builder.io/qwik/build source', () => {
        const source = `import { isServer } from '@builder.io/qwik/build';
console.log(isServer);
`;
        const result = runReplace(source, true);
        expect(result.code).toContain('console.log(true)');
        expect(result.replacedCount).toBe(1);
    });
    it('handles isServer from @qwik.dev/core (not just /build)', () => {
        const source = `import { isServer } from '@qwik.dev/core';
console.log(isServer);
`;
        const result = runReplace(source, false);
        expect(result.code).toContain('console.log(false)');
        expect(result.replacedCount).toBe(1);
    });
    it('replaces multiple references of the same identifier', () => {
        const source = `import { isServer } from '@qwik.dev/core/build';
if (isServer) { foo(); }
if (isServer) { bar(); }
`;
        const result = runReplace(source, true);
        expect(result.code).toContain('if (true) { foo(); }');
        expect(result.code).toContain('if (true) { bar(); }');
        expect(result.replacedCount).toBe(2);
    });
});
//# sourceMappingURL=const-replacement.test.js.map