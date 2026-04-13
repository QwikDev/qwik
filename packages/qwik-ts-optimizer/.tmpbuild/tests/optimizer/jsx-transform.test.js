/**
 * Unit tests for JSX transformation module.
 *
 * Tests classifyProp, computeFlags, JsxKeyCounter, and transformJsxElement.
 */
import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import { classifyProp, computeFlags, JsxKeyCounter, transformJsxElement, transformJsxFragment, isHtmlElement, processJsxTag, transformAllJsx, } from '../../src/optimizer/jsx-transform.js';
import MagicString from 'magic-string';
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Parse a JSX expression and return the expression node.
 */
function parseExpr(code) {
    const wrapped = `const x = ${code};`;
    const { program } = parseSync('test.tsx', wrapped);
    const decl = program.body[0];
    return decl.declarations[0].init;
}
/**
 * Parse JSX source and return the first JSX element or fragment node.
 */
function parseJsx(code) {
    const wrapped = `const x = ${code};`;
    const { program } = parseSync('test.tsx', wrapped);
    const decl = program.body[0];
    return decl.declarations[0].init;
}
// ---------------------------------------------------------------------------
// classifyProp
// ---------------------------------------------------------------------------
describe('classifyProp', () => {
    const importedNames = new Set(['dep', 'importedValue', 'styles']);
    it('returns const for string literals', () => {
        const node = parseExpr('"hello"');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns const for number literals', () => {
        const node = parseExpr('42');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns const for boolean literals', () => {
        const node = parseExpr('true');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns const for null literal', () => {
        const node = parseExpr('null');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns const for imported identifiers', () => {
        const node = parseExpr('dep');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns var for member expression on imported value (styles.foo)', () => {
        const node = parseExpr('styles.foo');
        // SWC is_const.rs treats ALL member expressions as var regardless of import status
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns var for signal.value access', () => {
        const node = parseExpr('signal.value');
        // signal is not in importedNames, so it's var
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns var for global variable reference', () => {
        const node = parseExpr('globalThing');
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns var for function calls', () => {
        const node = parseExpr('doSomething()');
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns var for window.document', () => {
        const node = parseExpr('window.document');
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns const for template literal without expressions', () => {
        const node = parseExpr('`hello world`');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns var for template literal with runtime expressions', () => {
        const node = parseExpr('`hello ${globalThing}`');
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns const for ternary with all-const operands', () => {
        const node = parseExpr('importedValue ? true : false');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns const for object literal with all-const values', () => {
        const node = parseExpr("{ foo: 'bar', baz: importedValue ? true : false }");
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns var for object literal with mutable values', () => {
        const node = parseExpr("{ foo: 'bar', baz: count % 2 === 0 }");
        expect(classifyProp(node, importedNames)).toBe('var');
    });
    it('returns const for array with all-const values', () => {
        const node = parseExpr('[1, 2, importedValue, null, {}]');
        expect(classifyProp(node, importedNames)).toBe('const');
    });
    it('returns var for array with mutable values', () => {
        const node = parseExpr('[1, 2, state, null, {}]');
        expect(classifyProp(node, importedNames)).toBe('var');
    });
});
// ---------------------------------------------------------------------------
// computeFlags
// ---------------------------------------------------------------------------
describe('computeFlags', () => {
    it('returns 3 for no varProps + static children (fully immutable)', () => {
        expect(computeFlags(false, 'static')).toBe(3);
    });
    it('returns 1 for no varProps + dynamic children', () => {
        expect(computeFlags(false, 'dynamic')).toBe(1);
    });
    it('returns 3 for varProps + static children (bit 0 always set outside loop)', () => {
        // Outside loop context, bit 0 is always set regardless of varProps
        expect(computeFlags(true, 'static')).toBe(3);
    });
    it('returns 1 for varProps + dynamic children (bit 0 always set outside loop)', () => {
        // Outside loop context, bit 0 is always set regardless of varProps
        expect(computeFlags(true, 'dynamic')).toBe(1);
    });
    it('returns 3 for no varProps + no children', () => {
        expect(computeFlags(false, 'none')).toBe(3);
    });
    it('returns 3 for varProps + no children (bit 0 always set outside loop)', () => {
        // Outside loop context, bit 0 is always set regardless of varProps
        expect(computeFlags(true, 'none')).toBe(3);
    });
    it('returns 4 for varProps + dynamic children in loop context', () => {
        // In loop context with varProps: bit 2 set, bit 0 NOT set
        expect(computeFlags(true, 'dynamic', true)).toBe(4);
    });
    it('returns 7 for no varProps + static children in loop context', () => {
        // In loop context without varProps: all three bits set
        expect(computeFlags(false, 'static', true)).toBe(7);
    });
});
// ---------------------------------------------------------------------------
// JsxKeyCounter
// ---------------------------------------------------------------------------
describe('JsxKeyCounter', () => {
    it('generates u6_0, u6_1, u6_2 sequentially', () => {
        const counter = new JsxKeyCounter();
        expect(counter.next()).toBe('u6_0');
        expect(counter.next()).toBe('u6_1');
        expect(counter.next()).toBe('u6_2');
    });
});
// ---------------------------------------------------------------------------
// transformJsxElement - basic elements
// ---------------------------------------------------------------------------
describe('transformJsxElement', () => {
    it('transforms <div class="class">12</div> to _jsxSorted call', () => {
        const source = '<div class="class">12</div>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        // Should produce _jsxSorted("div", null, { class: "class" }, "12", 3, null)
        expect(result).toBeDefined();
        expect(result.tag).toBe('"div"');
        expect(result.varProps).toBeNull();
        expect(result.constProps).toContain('class: "class"');
        expect(result.children).toBe('"12"');
        expect(result.flags).toBe(3);
    });
    it('puts string literal props in constProps', () => {
        const source = '<div title="hello"/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.constProps).toContain('title: "hello"');
        expect(result.varProps).toBeNull();
    });
    it('puts global variable props in varProps', () => {
        const source = '<div title={globalVar}/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.varProps).toContain('title: globalVar');
        expect(result.constProps).toBeNull();
    });
    it('puts imported member expression props in varProps', () => {
        const source = '<div class={styles.foo}/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set(['styles']);
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.varProps).toContain('class: styles.foo');
        expect(result.constProps).toBeNull();
    });
    it('handles self-closing elements with no children', () => {
        const source = '<div/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.children).toBeNull();
        expect(result.flags).toBe(3);
    });
    it('uses component identifier for uppercase tags', () => {
        const source = '<Cmp prop="23"/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        // Components use identifier, not string literal
        expect(result.tag).toBe('Cmp');
    });
    it('uses string literal for lowercase (HTML) tags', () => {
        const source = '<div/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.tag).toBe('"div"');
    });
    it('extracts explicit key={value} as 6th arg', () => {
        const source = '<Cmp prop="23" key={props.stuff}/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        // Key should be the expression, not auto-generated u6_N
        expect(result.key).toBe('props.stuff');
        // key should NOT appear in constProps or varProps
        expect(result.constProps).not.toContain('key');
    });
    it('extracts explicit key="stuff" as string literal', () => {
        const source = '<Cmp key="stuff"/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.key).toBe('"stuff"');
    });
    it('handles multiple children as array', () => {
        const source = '<div><span/><span/><span/></div>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        // Multiple children should produce array-like output
        expect(result.children).toContain('[');
        expect(result.children).toContain(']');
    });
    it('handles single child directly (not array)', () => {
        const source = '<div><p/></div>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        // Single child should NOT be in an array
        expect(result.children).not.toMatch(/^\[/);
    });
    it('handles spread props with _jsxSplit', () => {
        const source = '<button {...props}/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.callString).toContain('_jsxSplit');
        expect(result.callString).toContain('_getVarProps(props)');
        expect(result.callString).toContain('_getConstProps(props)');
        expect(result.flags).toBe(0);
        expect(result.neededImports.has('_jsxSplit')).toBe(true);
        expect(result.neededImports.has('_getVarProps')).toBe(true);
        expect(result.neededImports.has('_getConstProps')).toBe(true);
    });
    it('handles JSXMemberExpression tag (Foo.Bar)', () => {
        const source = '<Foo.Bar/>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxElement(jsxNode, source, s, importedNames, keyCounter);
        expect(result.tag).toBe('Foo.Bar');
    });
});
// ---------------------------------------------------------------------------
// isHtmlElement
// ---------------------------------------------------------------------------
describe('isHtmlElement', () => {
    it('returns true for lowercase tags', () => {
        expect(isHtmlElement('div')).toBe(true);
        expect(isHtmlElement('p')).toBe(true);
        expect(isHtmlElement('button')).toBe(true);
    });
    it('returns false for uppercase tags', () => {
        expect(isHtmlElement('Div')).toBe(false);
        expect(isHtmlElement('CustomComponent')).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// processJsxTag
// ---------------------------------------------------------------------------
describe('processJsxTag', () => {
    it('returns string literal for HTML elements', () => {
        const source = '<div/>';
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const nameNode = jsxNode.openingElement.name;
        expect(processJsxTag(nameNode)).toBe('"div"');
    });
    it('returns identifier for component elements', () => {
        const source = '<MyComponent/>';
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const nameNode = jsxNode.openingElement.name;
        expect(processJsxTag(nameNode)).toBe('MyComponent');
    });
    it('returns dotted path for member expressions', () => {
        const source = '<Foo.Bar/>';
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const nameNode = jsxNode.openingElement.name;
        expect(processJsxTag(nameNode)).toBe('Foo.Bar');
    });
});
// ---------------------------------------------------------------------------
// transformJsxFragment
// ---------------------------------------------------------------------------
describe('transformJsxFragment', () => {
    it('transforms <>child</> to _jsxSorted(_Fragment, ...)', () => {
        const source = '<>child</>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxFragment(jsxNode, source, s, importedNames, keyCounter);
        expect(result).toBeDefined();
        expect(result.tag).toBe('_Fragment');
        expect(result.callString).toContain('_jsxSorted(_Fragment');
        expect(result.children).toBe('"child"');
        expect(result.neededImports.has('_jsxSorted')).toBe(true);
    });
    it('transforms fragment with multiple children to array', () => {
        const source = '<><div/><span/></>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const jsxNode = program.body[0].expression;
        const importedNames = new Set();
        const keyCounter = new JsxKeyCounter();
        const result = transformJsxFragment(jsxNode, source, s, importedNames, keyCounter);
        expect(result.children).toContain('[');
    });
});
// ---------------------------------------------------------------------------
// transformAllJsx - integration
// ---------------------------------------------------------------------------
describe('transformAllJsx', () => {
    it('transforms nested JSX elements bottom-up', () => {
        const source = '<div><p>hello</p></div>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const importedNames = new Set();
        const output = transformAllJsx(source, s, program, importedNames);
        const result = s.toString();
        // Inner <p> should be transformed first, then outer <div>
        expect(result).toContain('_jsxSorted');
        expect(output.neededImports.has('_jsxSorted')).toBe(true);
    });
    it('sets needsFragment for fragment nodes', () => {
        const source = '<>child</>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const importedNames = new Set();
        const output = transformAllJsx(source, s, program, importedNames);
        expect(output.needsFragment).toBe(true);
    });
    it('adds PURE annotation to transformed calls', () => {
        const source = '<div class="foo">bar</div>';
        const s = new MagicString(source);
        const { program } = parseSync('test.tsx', source);
        const importedNames = new Set();
        const output = transformAllJsx(source, s, program, importedNames);
        const result = s.toString();
        expect(result).toContain('/*#__PURE__*/');
    });
});
//# sourceMappingURL=jsx-transform.test.js.map