/**
 * Tests for loop-hoisting module.
 *
 * Tests loop detection (all 6 types), .w() hoisting plan generation,
 * q:p/q:ps injection, and positional parameter padding.
 */
import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { detectLoopContext, hoistEventCaptures, findEnclosingLoop, generateParamPadding, buildQpProp, analyzeLoopHandler, } from '../../src/optimizer/loop-hoisting.js';
// ---------------------------------------------------------------------------
// Helper: parse source and find first node of given type
// ---------------------------------------------------------------------------
function findFirstNode(source, nodeType) {
    const { program } = parseSync('test.tsx', source);
    let found = null;
    walk(program, {
        enter(node) {
            if (!found && node.type === nodeType) {
                found = node;
            }
        },
    });
    return found;
}
function findAllNodes(source, nodeType) {
    const { program } = parseSync('test.tsx', source);
    const nodes = [];
    walk(program, {
        enter(node) {
            if (node.type === nodeType) {
                nodes.push(node);
            }
        },
    });
    return nodes;
}
/**
 * Helper: find a node and its ancestor chain
 */
function findNodeWithAncestors(source, nodeType, predicate) {
    const { program } = parseSync('test.tsx', source);
    let result = null;
    const ancestors = [];
    walk(program, {
        enter(node) {
            if (!result) {
                ancestors.push(node);
                if (node.type === nodeType && (!predicate || predicate(node))) {
                    result = { node, ancestors: [...ancestors] };
                }
            }
        },
        leave() {
            if (!result) {
                ancestors.pop();
            }
        },
    });
    return result;
}
// ---------------------------------------------------------------------------
// detectLoopContext
// ---------------------------------------------------------------------------
describe('detectLoopContext', () => {
    it('detects .map() call expression', () => {
        const source = `results.map((item) => item + 1)`;
        const node = findFirstNode(source, 'CallExpression');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('map');
        expect(ctx.iterVars).toEqual(['item']);
    });
    it('detects .map() with index parameter', () => {
        const source = `results.map((item, index) => item + index)`;
        const node = findFirstNode(source, 'CallExpression');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('map');
        expect(ctx.iterVars).toEqual(['item', 'index']);
    });
    it('detects ForStatement (for-i)', () => {
        const source = `for (let i = 0; i < 10; i++) { console.log(i); }`;
        const node = findFirstNode(source, 'ForStatement');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('for-i');
        expect(ctx.iterVars).toEqual(['i']);
    });
    it('detects ForOfStatement (for-of)', () => {
        const source = `for (const item of results) { console.log(item); }`;
        const node = findFirstNode(source, 'ForOfStatement');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('for-of');
        expect(ctx.iterVars).toEqual(['item']);
    });
    it('detects ForInStatement (for-in)', () => {
        const source = `for (const key in obj) { console.log(key); }`;
        const node = findFirstNode(source, 'ForInStatement');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('for-in');
        expect(ctx.iterVars).toEqual(['key']);
    });
    it('detects WhileStatement', () => {
        const source = `while (i < 10) { i++; }`;
        const node = findFirstNode(source, 'WhileStatement');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('while');
        expect(ctx.iterVars).toEqual([]);
    });
    it('detects DoWhileStatement', () => {
        const source = `do { i++; } while (i < 10);`;
        const node = findFirstNode(source, 'DoWhileStatement');
        const ctx = detectLoopContext(node, source);
        expect(ctx).not.toBeNull();
        expect(ctx.type).toBe('do-while');
        expect(ctx.iterVars).toEqual([]);
    });
    it('returns null for non-loop node', () => {
        const source = `const x = 1 + 2;`;
        const node = findFirstNode(source, 'VariableDeclaration');
        const ctx = detectLoopContext(node, source);
        expect(ctx).toBeNull();
    });
    it('returns null for non-.map() call expression', () => {
        const source = `results.filter((item) => item > 0)`;
        const node = findFirstNode(source, 'CallExpression');
        const ctx = detectLoopContext(node, source);
        expect(ctx).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// hoistEventCaptures
// ---------------------------------------------------------------------------
describe('hoistEventCaptures', () => {
    it('produces hoisted .w() declaration with single capture', () => {
        const plan = hoistEventCaptures('handler', 'q_handler_qrl', ['cart']);
        expect(plan).not.toBeNull();
        expect(plan.hoistedDecl).toBe('const handler = q_handler_qrl.w([cart])');
        expect(plan.qrlRefName).toBe('handler');
        expect(plan.originalQrlRef).toBe('q_handler_qrl');
    });
    it('produces hoisted .w() declaration with multiple captures', () => {
        const plan = hoistEventCaptures('handler', 'q_handler_qrl', [
            'cart',
            'results',
        ]);
        expect(plan).not.toBeNull();
        expect(plan.hoistedDecl).toBe('const handler = q_handler_qrl.w([cart, results])');
    });
    it('returns null when no captures', () => {
        const plan = hoistEventCaptures('handler', 'q_handler_qrl', []);
        expect(plan).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// findEnclosingLoop
// ---------------------------------------------------------------------------
describe('findEnclosingLoop', () => {
    it('finds enclosing .map() loop for a node inside', () => {
        const source = `results.map((item) => { const x = item; })`;
        const result = findNodeWithAncestors(source, 'VariableDeclaration');
        expect(result).not.toBeNull();
        const loopCtx = findEnclosingLoop(result.node, result.ancestors);
        expect(loopCtx).not.toBeNull();
        expect(loopCtx.type).toBe('map');
    });
    it('finds enclosing for-of loop', () => {
        const source = `for (const item of results) { const x = item; }`;
        // Find all VariableDeclarations - the first is the for-of's own "const item",
        // the second is "const x = item" inside the body
        const { program } = parseSync('test.tsx', source);
        const allDecls = [];
        const ancestorStack = [];
        walk(program, {
            enter(node) {
                ancestorStack.push(node);
                if (node.type === 'VariableDeclaration') {
                    allDecls.push({ node, ancestors: [...ancestorStack] });
                }
            },
            leave() {
                ancestorStack.pop();
            },
        });
        // The second VariableDeclaration should be "const x = item" inside the loop body
        expect(allDecls.length).toBeGreaterThanOrEqual(2);
        const bodyDecl = allDecls[1];
        const loopCtx = findEnclosingLoop(bodyDecl.node, bodyDecl.ancestors);
        expect(loopCtx).not.toBeNull();
        expect(loopCtx.type).toBe('for-of');
    });
    it('returns null when not inside a loop', () => {
        const source = `const x = 1;`;
        const result = findNodeWithAncestors(source, 'VariableDeclaration');
        expect(result).not.toBeNull();
        const loopCtx = findEnclosingLoop(result.node, result.ancestors);
        expect(loopCtx).toBeNull();
    });
    it('finds nearest enclosing loop in nested loops', () => {
        const source = `
      results.map((row) => {
        row.map((cell) => {
          const x = cell;
        });
      });
    `;
        const result = findNodeWithAncestors(source, 'VariableDeclaration');
        expect(result).not.toBeNull();
        const loopCtx = findEnclosingLoop(result.node, result.ancestors);
        expect(loopCtx).not.toBeNull();
        expect(loopCtx.type).toBe('map');
        // Should find the inner .map(), not the outer one
        expect(loopCtx.iterVars).toEqual(['cell']);
    });
});
// ---------------------------------------------------------------------------
// generateParamPadding
// ---------------------------------------------------------------------------
describe('generateParamPadding', () => {
    it('generates base padding with no loop vars', () => {
        const params = generateParamPadding([]);
        expect(params).toEqual(['_', '_1']);
    });
    it('generates padding with single loop var', () => {
        const params = generateParamPadding(['item']);
        expect(params).toEqual(['_', '_1', 'item']);
    });
    it('generates padding with multiple loop vars', () => {
        const params = generateParamPadding(['index', 'item']);
        expect(params).toEqual(['_', '_1', 'index', 'item']);
    });
});
// ---------------------------------------------------------------------------
// buildQpProp
// ---------------------------------------------------------------------------
describe('buildQpProp', () => {
    it('returns null for empty loop vars', () => {
        const result = buildQpProp([]);
        expect(result).toBeNull();
    });
    it('returns q:p for single loop var', () => {
        const result = buildQpProp(['item']);
        expect(result).not.toBeNull();
        expect(result.propName).toBe('q:p');
        expect(result.propValue).toBe('item');
    });
    it('returns q:ps for multiple loop vars sorted alphabetically', () => {
        const result = buildQpProp(['index', 'item']);
        expect(result).not.toBeNull();
        expect(result.propName).toBe('q:ps');
        expect(result.propValue).toBe('[index, item]');
    });
    it('sorts loop vars alphabetically for q:ps', () => {
        const result = buildQpProp(['z', 'a', 'm']);
        expect(result).not.toBeNull();
        expect(result.propName).toBe('q:ps');
        expect(result.propValue).toBe('[a, m, z]');
    });
});
// ---------------------------------------------------------------------------
// analyzeLoopHandler
// ---------------------------------------------------------------------------
describe('analyzeLoopHandler', () => {
    it('produces full loop hoist result with single loop var', () => {
        const source = `results.map((item) => item + 1)`;
        const node = findFirstNode(source, 'CallExpression');
        const loopCtx = detectLoopContext(node, source);
        const result = analyzeLoopHandler('handler', 'q_handler_qrl', ['cart'], ['item'], loopCtx);
        expect(result.hoistedDecl).toBe('const handler = q_handler_qrl.w([cart])');
        expect(result.qpProp).not.toBeNull();
        expect(result.qpProp.propName).toBe('q:p');
        expect(result.qpProp.propValue).toBe('item');
        expect(result.paramNames).toEqual(['_', '_1', 'item']);
        expect(result.flags & 4).toBe(4); // bit 2 set
    });
    it('produces q:ps for multiple loop vars', () => {
        const source = `results.map((item, index) => item)`;
        const node = findFirstNode(source, 'CallExpression');
        const loopCtx = detectLoopContext(node, source);
        const result = analyzeLoopHandler('handler', 'q_handler_qrl', ['cart'], ['item', 'index'], loopCtx);
        expect(result.qpProp.propName).toBe('q:ps');
        expect(result.qpProp.propValue).toBe('[index, item]');
        expect(result.paramNames).toEqual(['_', '_1', 'item', 'index']);
    });
    it('returns null hoistedDecl when no captures', () => {
        const source = `results.map((item) => item)`;
        const node = findFirstNode(source, 'CallExpression');
        const loopCtx = detectLoopContext(node, source);
        const result = analyzeLoopHandler('handler', 'q_handler_qrl', [], ['item'], loopCtx);
        expect(result.hoistedDecl).toBeNull();
        expect(result.qpProp.propName).toBe('q:p');
    });
    it('flags include bit 2 (value 4) for loop context', () => {
        const source = `results.map((item) => item)`;
        const node = findFirstNode(source, 'CallExpression');
        const loopCtx = detectLoopContext(node, source);
        const result = analyzeLoopHandler('handler', 'q_handler_qrl', ['cart'], ['item'], loopCtx);
        expect(result.flags).toBe(4);
    });
});
// ---------------------------------------------------------------------------
// Snapshot-matching patterns
// ---------------------------------------------------------------------------
describe('snapshot pattern matching', () => {
    it('matches loop hoisting pattern from event_listeners_inside_loop snap', () => {
        // From snapshot: paramNames: ["_", "_1", "item"], captureNames: ["cart"]
        // The handler segment signature is (_, _1, item) with cart captured via .w()
        const params = generateParamPadding(['item']);
        expect(params).toEqual(['_', '_1', 'item']);
        const hoistPlan = hoistEventCaptures('App_component_loopArrowFn_span_q_e_click_Wau7C836nf0', 'q_App_component_loopArrowFn_span_q_e_click_Wau7C836nf0', ['cart']);
        expect(hoistPlan).not.toBeNull();
        expect(hoistPlan.hoistedDecl).toContain('.w([cart])');
        const qp = buildQpProp(['item']);
        expect(qp.propName).toBe('q:p');
        expect(qp.propValue).toBe('item');
    });
    it('matches nested loop pattern from cross_scope snap', () => {
        // From snapshot: paramNames: ["_", "_1", "j", "cellKey"], captureNames: ["i"]
        // Multiple loop vars -> q:ps sorted alphabetically
        const params = generateParamPadding(['j', 'cellKey']);
        expect(params).toEqual(['_', '_1', 'j', 'cellKey']);
        const qp = buildQpProp(['j', 'cellKey']);
        expect(qp.propName).toBe('q:ps');
        expect(qp.propValue).toBe('[cellKey, j]');
    });
    it('matches for-i loop pattern with captures', () => {
        // From snapshot: paramNames: ["_", "_1", "i"], captureNames: ["cart", "results"]
        const params = generateParamPadding(['i']);
        expect(params).toEqual(['_', '_1', 'i']);
        const hoistPlan = hoistEventCaptures('App_component_loopForI_span_q_e_click_PbCYbPM6etI', 'q_App_component_loopForI_span_q_e_click_PbCYbPM6etI', ['cart', 'results']);
        expect(hoistPlan.hoistedDecl).toContain('.w([cart, results])');
    });
    it('matches for-in loop pattern with key iter var', () => {
        // From snapshot: paramNames: ["_", "_1", "key"], captureNames: ["cart", "results"]
        const params = generateParamPadding(['key']);
        expect(params).toEqual(['_', '_1', 'key']);
        const qp = buildQpProp(['key']);
        expect(qp.propName).toBe('q:p');
        expect(qp.propValue).toBe('key');
    });
});
//# sourceMappingURL=loop-hoisting.test.js.map