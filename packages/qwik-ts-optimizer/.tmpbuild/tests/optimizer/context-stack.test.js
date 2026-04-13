import { describe, it, expect } from 'vitest';
import { ContextStack } from '../../src/optimizer/context-stack.js';
describe('ContextStack', () => {
    it('empty stack produces "s_" display name suffix', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        expect(ctx.getDisplayName()).toBe('test.tsx_s_');
    });
    it('push("Header") then push("component$") produces correct display name', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        ctx.push('Header');
        ctx.push('component$');
        expect(ctx.getDisplayName()).toBe('test.tsx_Header_component');
    });
    it('nested context produces full display name chain', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        ctx.push('Header');
        ctx.push('component$');
        ctx.push('div');
        ctx.push('onClick$');
        expect(ctx.getDisplayName()).toBe('test.tsx_Header_component_div_onClick');
    });
    it('pop() removes last context', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        ctx.push('Header');
        ctx.push('component$');
        ctx.pop();
        expect(ctx.getDisplayName()).toBe('test.tsx_Header');
    });
    it('getSymbolName() produces "{contextPortion}_{hash}" format', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        ctx.push('Header');
        ctx.push('component$');
        const symbolName = ctx.getSymbolName();
        // Should be "Header_component_{hash}"
        expect(symbolName).toMatch(/^Header_component_[A-Za-z0-9]+$/);
    });
    it('default export stem extraction: "[[...slug]].tsx" -> pushes "slug"', () => {
        const ctx = new ContextStack('[[...slug]].tsx', '[[...slug]].tsx');
        ctx.pushDefaultExport();
        expect(ctx.getContextStack()).toEqual(['slug']);
    });
    it('default export stem extraction: "[id].tsx" -> pushes "id"', () => {
        const ctx = new ContextStack('[id].tsx', '[id].tsx');
        ctx.pushDefaultExport();
        expect(ctx.getContextStack()).toEqual(['id']);
    });
    it('depth property tracks stack size', () => {
        const ctx = new ContextStack('test.tsx', 'test.tsx');
        expect(ctx.depth).toBe(0);
        ctx.push('Header');
        expect(ctx.depth).toBe(1);
        ctx.push('component$');
        expect(ctx.depth).toBe(2);
        ctx.pop();
        expect(ctx.depth).toBe(1);
    });
});
//# sourceMappingURL=context-stack.test.js.map