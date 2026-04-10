/**
 * Unit tests for JSX transformation module.
 *
 * Tests classifyProp, computeFlags, JsxKeyCounter, and transformJsxElement.
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  classifyProp,
  computeFlags,
  JsxKeyCounter,
  transformJsxElement,
} from '../../src/optimizer/jsx-transform.js';
import MagicString from 'magic-string';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a JSX expression and return the expression node.
 */
function parseExpr(code: string): any {
  const wrapped = `const x = ${code};`;
  const { program } = parseSync('test.tsx', wrapped);
  const decl = program.body[0] as any;
  return decl.declarations[0].init;
}

/**
 * Parse JSX source and return the first JSX element or fragment node.
 */
function parseJsx(code: string): any {
  const wrapped = `const x = ${code};`;
  const { program } = parseSync('test.tsx', wrapped);
  const decl = program.body[0] as any;
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

  it('returns const for member expression on imported value (styles.foo)', () => {
    const node = parseExpr('styles.foo');
    expect(classifyProp(node, importedNames)).toBe('const');
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

  it('returns 2 for varProps + static children', () => {
    expect(computeFlags(true, 'static')).toBe(2);
  });

  it('returns 0 for varProps + dynamic children', () => {
    expect(computeFlags(true, 'dynamic')).toBe(0);
  });

  it('returns 3 for no varProps + no children', () => {
    expect(computeFlags(false, 'none')).toBe(3);
  });

  it('returns 2 for varProps + no children', () => {
    expect(computeFlags(true, 'none')).toBe(2);
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
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    // Should produce _jsxSorted("div", null, { class: "class" }, "12", 3, null)
    expect(result).toBeDefined();
    expect(result!.tag).toBe('"div"');
    expect(result!.varProps).toBeNull();
    expect(result!.constProps).toContain('class: "class"');
    expect(result!.children).toBe('"12"');
    expect(result!.flags).toBe(3);
  });

  it('puts string literal props in constProps', () => {
    const source = '<div title="hello"/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    expect(result!.constProps).toContain('title: "hello"');
    expect(result!.varProps).toBeNull();
  });

  it('puts global variable props in varProps', () => {
    const source = '<div title={globalVar}/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    expect(result!.varProps).toContain('title: globalVar');
    expect(result!.constProps).toBeNull();
  });

  it('puts imported value props in constProps', () => {
    const source = '<div class={styles.foo}/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set(['styles']);
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    expect(result!.constProps).toContain('class: styles.foo');
    expect(result!.varProps).toBeNull();
  });

  it('handles self-closing elements with no children', () => {
    const source = '<div/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    expect(result!.children).toBeNull();
    expect(result!.flags).toBe(3);
  });

  it('uses component identifier for uppercase tags', () => {
    const source = '<Cmp prop="23"/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    // Components use identifier, not string literal
    expect(result!.tag).toBe('Cmp');
  });

  it('uses string literal for lowercase (HTML) tags', () => {
    const source = '<div/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      jsxNode,
      source,
      s,
      importedNames,
      keyCounter,
    );

    expect(result!.tag).toBe('"div"');
  });
});
