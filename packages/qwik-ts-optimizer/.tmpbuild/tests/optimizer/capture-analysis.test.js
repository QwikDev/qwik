/**
 * Tests for capture analysis module.
 *
 * Verifies that analyzeCaptures() correctly detects variables crossing $()
 * boundaries, handles var hoisting, destructured bindings, globals/imports
 * exclusion, and the distinction between captureNames and paramNames.
 */
import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { walk } from 'oxc-walker';
import { analyzeCaptures, collectParamNames, } from '../../src/optimizer/capture-analysis.js';
// ---------------------------------------------------------------------------
// Helper: find the $() call's argument node in parsed source
// ---------------------------------------------------------------------------
/**
 * Parse source and find the first ArrowFunctionExpression or FunctionExpression
 * that is a direct argument to a $() call (any call whose callee ends with $).
 * Returns the argument node and the set of identifiers declared in the
 * enclosing scope.
 */
function findDollarArg(source) {
    const { program } = parseSync('test.tsx', source);
    let argNode = null;
    const importedNames = new Set();
    // Collect imports
    for (const node of program.body) {
        if (node.type === 'ImportDeclaration') {
            for (const spec of node.specifiers) {
                if (spec.local?.name) {
                    importedNames.add(spec.local.name);
                }
            }
        }
    }
    // Walk to find the $() call argument
    walk(program, {
        enter(node) {
            if (node.type === 'CallExpression' &&
                node.callee?.type === 'Identifier' &&
                node.callee.name.endsWith('$') &&
                node.arguments?.[0] &&
                !argNode) {
                argNode = node.arguments[0];
            }
        },
    });
    if (!argNode) {
        throw new Error('No $() call argument found in source');
    }
    // Collect parent scope identifiers (everything declared outside the $() arg)
    const parentScopeIds = new Set();
    walk(program, {
        enter(node, parent) {
            // Skip the $() argument subtree
            if (node === argNode) {
                this.skip();
                return;
            }
            // Collect variable declarations
            if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
                parentScopeIds.add(node.id.name);
            }
            // Collect function params (for enclosing arrow/function)
            if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
                node.params) {
                for (const param of node.params) {
                    collectBindingNames(param, parentScopeIds);
                }
            }
        },
    });
    return { argNode, parentScopeIds, importedNames };
}
/** Recursively collect binding names from a pattern node. */
function collectBindingNames(node, names) {
    if (!node)
        return;
    if (node.type === 'Identifier') {
        names.add(node.name);
        return;
    }
    if (node.type === 'ObjectPattern') {
        for (const prop of node.properties) {
            if (prop.type === 'RestElement') {
                collectBindingNames(prop.argument, names);
            }
            else {
                collectBindingNames(prop.value, names);
            }
        }
        return;
    }
    if (node.type === 'ArrayPattern') {
        for (const elem of node.elements) {
            collectBindingNames(elem, names);
        }
        return;
    }
    if (node.type === 'RestElement') {
        collectBindingNames(node.argument, names);
        return;
    }
    if (node.type === 'AssignmentPattern') {
        collectBindingNames(node.left, names);
        return;
    }
}
/**
 * Helper to find inner $() argument when there are nested $() calls.
 * Finds the Nth $() call argument (0-indexed).
 */
function findNthDollarArg(source, n) {
    const { program } = parseSync('test.tsx', source);
    const argNodes = [];
    const importedNames = new Set();
    for (const node of program.body) {
        if (node.type === 'ImportDeclaration') {
            for (const spec of node.specifiers) {
                if (spec.local?.name) {
                    importedNames.add(spec.local.name);
                }
            }
        }
    }
    walk(program, {
        enter(node) {
            if (node.type === 'CallExpression' &&
                node.callee?.type === 'Identifier' &&
                node.callee.name.endsWith('$') &&
                node.arguments?.[0]) {
                argNodes.push(node.arguments[0]);
            }
        },
    });
    if (argNodes.length <= n) {
        throw new Error(`Only found ${argNodes.length} $() calls, wanted index ${n}`);
    }
    const argNode = argNodes[n];
    // Collect parent scope identifiers outside this specific argNode
    const parentScopeIds = new Set();
    walk(program, {
        enter(node) {
            if (node === argNode) {
                this.skip();
                return;
            }
            if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
                parentScopeIds.add(node.id.name);
            }
            if ((node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression' || node.type === 'FunctionDeclaration') &&
                node !== argNode &&
                node.params) {
                for (const param of node.params) {
                    collectBindingNames(param, parentScopeIds);
                }
            }
        },
    });
    return { argNode, parentScopeIds, importedNames };
}
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('analyzeCaptures', () => {
    it('Test 1: simple capture - detects variable from enclosing scope', () => {
        const source = `
      import { component$, useStore, $ } from '@qwik.dev/core';
      export const App = component$(() => {
        const s = useStore({});
        return $(() => { s.count++ });
      });
    `;
        // The inner $() is the second $() call (index 1)
        const { argNode, parentScopeIds, importedNames } = findNthDollarArg(source, 1);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['s']);
    });
    it('Test 2: multiple captures sorted alphabetically', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        const zebra = 1;
        const alpha = 2;
        const mid = 3;
        $(() => { zebra; alpha; mid; });
      }
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['alpha', 'mid', 'zebra']);
    });
    it('Test 3: globals excluded - console is not captured', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        const x = 1;
        $(() => { console.log(x); });
      }
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['x']);
        expect(result.captureNames).not.toContain('console');
    });
    it('Test 4: import bindings excluded - only local vars captured', () => {
        const source = `
      import { $, useStore } from '@qwik.dev/core';
      function test() {
        const state = useStore({});
        $(() => { useStore; state; });
      }
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['state']);
        expect(result.captureNames).not.toContain('useStore');
    });
    it('Test 5: var hoisting - var-declared variable IS captured', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      function test() {
        var x = 1;
        $(() => { x++; });
      }
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['x']);
    });
    it('Test 6: destructured parameters produce individual captures', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      const fn = ({count, name}) => {
        $(() => { count; name; });
      };
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captures).toBe(true);
        expect(result.captureNames).toEqual(['count', 'name']);
    });
    it('Test 7: paramNames extraction - arrow with single param', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      $((props) => { props.value; });
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.paramNames).toEqual(['props']);
    });
    it('Test 8: no captures for module-level refs - returns empty', () => {
        // Module-level vars are NOT in parentScopeIdentifiers (they go through migration)
        const source = `
      import { $ } from '@qwik.dev/core';
      const moduleVar = 42;
      $(() => { moduleVar; });
    `;
        // For module-level, parentScopeIds is empty (no enclosing function scope)
        const { argNode, importedNames } = findDollarArg(source);
        const emptyParentScope = new Set();
        const result = analyzeCaptures(argNode, emptyParentScope, importedNames);
        expect(result.captures).toBe(false);
        expect(result.captureNames).toEqual([]);
    });
    it('Test 9: function own parameters are NOT captured', () => {
        const source = `
      import { $ } from '@qwik.dev/core';
      $((event) => { event.target; });
    `;
        const { argNode, parentScopeIds, importedNames } = findDollarArg(source);
        const result = analyzeCaptures(argNode, parentScopeIds, importedNames);
        expect(result.captureNames).not.toContain('event');
        expect(result.captures).toBe(false);
    });
});
describe('collectParamNames', () => {
    it('extracts simple identifier params', () => {
        const source = `const fn = (a, b, c) => {};`;
        const { program } = parseSync('test.ts', source);
        let params = [];
        walk(program, {
            enter(node) {
                if (node.type === 'ArrowFunctionExpression') {
                    params = node.params;
                }
            },
        });
        expect(collectParamNames(params)).toEqual(['a', 'b', 'c']);
    });
    it('extracts destructured object params', () => {
        const source = `const fn = ({a, b}) => {};`;
        const { program } = parseSync('test.ts', source);
        let params = [];
        walk(program, {
            enter(node) {
                if (node.type === 'ArrowFunctionExpression') {
                    params = node.params;
                }
            },
        });
        expect(collectParamNames(params)).toEqual(['a', 'b']);
    });
    it('extracts rest params', () => {
        const source = `const fn = (a, ...rest) => {};`;
        const { program } = parseSync('test.ts', source);
        let params = [];
        walk(program, {
            enter(node) {
                if (node.type === 'ArrowFunctionExpression') {
                    params = node.params;
                }
            },
        });
        expect(collectParamNames(params)).toEqual(['a', 'rest']);
    });
    it('extracts params with defaults', () => {
        const source = `const fn = (a = 1, {b} = {}) => {};`;
        const { program } = parseSync('test.ts', source);
        let params = [];
        walk(program, {
            enter(node) {
                if (node.type === 'ArrowFunctionExpression') {
                    params = node.params;
                }
            },
        });
        expect(collectParamNames(params)).toEqual(['a', 'b']);
    });
});
//# sourceMappingURL=capture-analysis.test.js.map