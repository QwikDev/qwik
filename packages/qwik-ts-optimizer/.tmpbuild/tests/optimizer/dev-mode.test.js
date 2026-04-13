/**
 * Tests for dev mode QRL declaration builders and JSX source info.
 *
 * Covers: MODE-01 (qrlDEV), MODE-02 (JSX source info), MODE-03 (_useHmr).
 */
import { describe, it, expect } from 'vitest';
import { buildQrlDevDeclaration, buildDevFilePath, buildJsxSourceInfo, buildUseHmrCall, } from '../../src/optimizer/dev-mode.js';
describe('buildQrlDevDeclaration', () => {
    // MODE-01: Dev mode emits qrlDEV with file/lo/hi/displayName
    it('generates correct qrlDEV declaration matching snapshot format', () => {
        const result = buildQrlDevDeclaration('App_component_ckEPmXZlub0', 'test.tsx_App_component_ckEPmXZlub0', '/user/qwik/src/test.tsx', 88, 200, 'test.tsx_App_component');
        expect(result).toBe('const q_App_component_ckEPmXZlub0 = /*#__PURE__*/ qrlDEV(()=>import("./test.tsx_App_component_ckEPmXZlub0"), "App_component_ckEPmXZlub0", {\n' +
            '    file: "/user/qwik/src/test.tsx",\n' +
            '    lo: 88,\n' +
            '    hi: 200,\n' +
            '    displayName: "test.tsx_App_component"\n' +
            '});');
    });
    it('handles different symbol names and paths', () => {
        const result = buildQrlDevDeclaration('Counter_component_onClick_abc', 'src/counter.tsx_Counter_component_onClick_abc', '/project/src/counter.tsx', 10, 50, 'src/counter.tsx_Counter_component_onClick');
        expect(result).toContain('qrlDEV(');
        expect(result).toContain('"Counter_component_onClick_abc"');
        expect(result).toContain('file: "/project/src/counter.tsx"');
        expect(result).toContain('lo: 10');
        expect(result).toContain('hi: 50');
    });
});
describe('buildDevFilePath', () => {
    it('returns devPath when provided', () => {
        expect(buildDevFilePath('test.tsx', '/src', '/custom/dev/path/test.tsx')).toBe('/custom/dev/path/test.tsx');
    });
    it('constructs from srcDir + inputPath when no devPath', () => {
        expect(buildDevFilePath('test.tsx', '/user/qwik/src')).toBe('/user/qwik/src/test.tsx');
    });
    it('handles srcDir with trailing slash', () => {
        expect(buildDevFilePath('test.tsx', '/user/qwik/src/')).toBe('/user/qwik/src/test.tsx');
    });
});
describe('buildJsxSourceInfo', () => {
    // MODE-02: Dev mode JSX has trailing source info argument
    it('generates correct source info object literal', () => {
        const result = buildJsxSourceInfo('project/index.tsx', 7, 4);
        expect(result).toBe('{\n    fileName: "project/index.tsx",\n    lineNumber: 7,\n    columnNumber: 4\n}');
    });
});
describe('buildUseHmrCall', () => {
    // MODE-03: Component segments in dev mode have _useHmr call
    it('generates _useHmr call with file path', () => {
        const result = buildUseHmrCall('/user/qwik/src/test.tsx');
        expect(result).toContain('_useHmr(');
        expect(result).toContain('/user/qwik/src/test.tsx');
    });
});
//# sourceMappingURL=dev-mode.test.js.map