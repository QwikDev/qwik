/**
 * Unit tests for JSX transformation module.
 *
 * Tests classifyConstness, computeJsxFlags, JsxKeyCounter, and transformJsxElement.
 */

import { describe, it, expect } from 'vitest';
import { parseSync } from 'oxc-parser';
import {
  classifyConstness,
  collectScopeAwareBindings,
  computeJsxFlags,
  JsxKeyCounter,
  transformJsxElement,
  transformJsxFragment,
  isHtmlElement,
  processJsxTag,
  transformAllJsx,
  type JsxTransformContext,
} from '../../src/optimizer/jsx/jsx.js';
import { SignalHoister } from '../../src/optimizer/jsx/signal-analysis.js';
import MagicString from 'magic-string';

function makeCtx(
  source: string,
  s: MagicString,
  importedNames: Set<string>,
  keyCounter: JsxKeyCounter,
): JsxTransformContext {
  return { source, s, importedNames, keyCounter, signalHoister: new SignalHoister() };
}

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
// classifyConstness
// ---------------------------------------------------------------------------

describe('classifyConstness', () => {
  const importedNames = new Set(['dep', 'importedValue', 'styles']);

  it('returns const for string literals', () => {
    const node = parseExpr('"hello"');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns const for number literals', () => {
    const node = parseExpr('42');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns const for boolean literals', () => {
    const node = parseExpr('true');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns const for null literal', () => {
    const node = parseExpr('null');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns const for imported identifiers', () => {
    const node = parseExpr('dep');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns var for member expression on imported value (styles.foo)', () => {
    const node = parseExpr('styles.foo');
    // SWC is_const.rs treats ALL member expressions as var regardless of import status
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns var for signal.value access', () => {
    const node = parseExpr('signal.value');
    // signal is not in importedNames, so it's var
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns var for global variable reference', () => {
    const node = parseExpr('globalThing');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns var for function calls', () => {
    const node = parseExpr('doSomething()');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns var for window.document', () => {
    const node = parseExpr('window.document');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns const for template literal without expressions', () => {
    const node = parseExpr('`hello world`');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns var for template literal with runtime expressions', () => {
    const node = parseExpr('`hello ${globalThing}`');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns const for ternary with all-const operands', () => {
    const node = parseExpr('importedValue ? true : false');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns const for object literal with all-const values', () => {
    const node = parseExpr("{ foo: 'bar', baz: importedValue ? true : false }");
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns var for object literal with mutable values', () => {
    const node = parseExpr("{ foo: 'bar', baz: count % 2 === 0 }");
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });

  it('returns const for array with all-const values', () => {
    const node = parseExpr('[1, 2, importedValue, null, {}]');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('const');
  });

  it('returns var for array with mutable values', () => {
    const node = parseExpr('[1, 2, state, null, {}]');
    expect(classifyConstness(node, importedNames, undefined, 0)).toBe('var');
  });
});

// ---------------------------------------------------------------------------
// collectScopeAwareBindings (OSS-401)
// ---------------------------------------------------------------------------

describe('collectScopeAwareBindings (OSS-401 — scope shadowing)', () => {
  /** Parse a program and return both the scope-aware bindings and the
   * source text so tests can locate positions via `source.indexOf(...)`. */
  function setup(source: string): {
    bindings: ReturnType<typeof collectScopeAwareBindings>['bindings'];
    source: string;
  } {
    const { program } = parseSync('test.tsx', source);
    const { bindings } = collectScopeAwareBindings(program as any);
    return { bindings, source };
  }

  it('classifies a for-of binding as const at its body position', () => {
    const source = `
function f() {
  for (const item of arr) {
    use(item);
  }
}`;
    const { bindings, source: src } = setup(source);
    const refPos = src.indexOf('use(item)') + 4; // position of "item" inside use(item)
    expect(bindings.classify('item', refPos)).toBe('const');
  });

  it('classifies an arrow param as var at its body position', () => {
    const source = `
function f() {
  arr.map((item) => use(item));
}`;
    const { bindings, source: src } = setup(source);
    const refPos = src.indexOf('use(item)') + 4;
    expect(bindings.classify('item', refPos)).toBe('var');
  });

  it('shadows: arrow param wins over outer for-of binding of the same name', () => {
    // This is the core OSS-401 case from `example_component_with_event_listeners_inside_loop`:
    // two scopes in the same file both declare `item`. References inside the
    // arrow body should resolve to the arrow param (var); references inside
    // the for-of body should resolve to the for-of binding (const).
    const source = `
function outer() {
  arr.map((item) => use(item));      // arrow param 'item' — var
  for (const item of arr) {           // for-of binding 'item' — const
    use(item);
  }
}`;
    const { bindings, source: src } = setup(source);
    const arrowRef = src.indexOf('use(item))') + 4;
    const forOfRef = src.indexOf('use(item);') + 4;
    expect(bindings.classify('item', arrowRef)).toBe('var');
    expect(bindings.classify('item', forOfRef)).toBe('const');
  });

  it('shadows: inner arrow param shadows outer for-of binding', () => {
    const source = `
function outer() {
  for (const item of arr) {
    arr.map((item) => use(item));    // inner 'item' (arrow param) shadows outer 'item' (for-of)
  }
}`;
    const { bindings, source: src } = setup(source);
    const innerRef = src.indexOf('use(item)') + 4;
    // Inner arrow body sees the inner arrow param (var).
    expect(bindings.classify('item', innerRef)).toBe('var');
  });

  it('classifies a catch param as var', () => {
    const source = `
function f() {
  try { x; } catch (err) { use(err); }
}`;
    const { bindings, source: src } = setup(source);
    const refPos = src.indexOf('use(err)') + 4;
    expect(bindings.classify('err', refPos)).toBe('var');
  });

  it('classifies a block-scoped const with literal init as var (matches SWC Var(is_const && is_static))', () => {
    // `isReturnStatic` only returns true for CallExpressions ending in
    // `$/Qrl` or starting with `use` (SWC's `is_static` requires the init
    // to propagate from a Var(true) source). A bare literal init like `42`
    // doesn't pass that check, so the const declaration classifies as var.
    // This matches the prior `walkPatternInit` semantics exactly.
    const source = `
function f() {
  {
    const n = 42;
    use(n);
  }
}`;
    const { bindings, source: src } = setup(source);
    const refPos = src.indexOf('use(n)') + 4;
    expect(bindings.classify('n', refPos)).toBe('var');
  });

  it('classifies a `const x = useStore()` declaration as const (isReturnStatic)', () => {
    const source = `function f() { const store = useStore({c: 0}); use(store); }`;
    const { bindings, source: src } = setup(source);
    expect(bindings.classify('store', src.indexOf('use(store)') + 4)).toBe('const');
  });

  it('returns undefined for names that are not declared anywhere', () => {
    const source = `function f() { use(undeclared); }`;
    const { bindings } = setup(source);
    expect(bindings.classify('undeclared', 20)).toBeUndefined();
  });

  it('addProgramScopeConst classifies as const everywhere, overriding inner var bindings', () => {
    // Matches segment-codegen capture-injection semantics: capture names get
    // injected as program-scope consts. Even though `_captures[N]` unpacking
    // creates an AST-level const declaration whose MemberExpression init
    // would normally classify as 'var', the alwaysConst override wins so
    // the name classifies as const at any reference position.
    const source = `
const state = _captures[0];
function inner() {
  use(state);
}`;
    const { bindings } = setup(source);
    bindings.addProgramScopeConst('state');
    expect(bindings.classify('state', source.indexOf('use(state)') + 4)).toBe('const');
  });

  it('for-in binding classifies as const (matches SWC for-of treatment)', () => {
    const source = `
function f() {
  for (const key in obj) {
    use(key);
  }
}`;
    const { bindings, source: src } = setup(source);
    const refPos = src.indexOf('use(key)') + 4;
    expect(bindings.classify('key', refPos)).toBe('const');
  });

  it('let-bound variable classifies as var', () => {
    const source = `function f() { let count = 0; use(count); }`;
    const { bindings, source: src } = setup(source);
    expect(bindings.classify('count', src.indexOf('use(count)') + 4)).toBe('var');
  });

  it('compound destructure with literal-array init: per-elem classification', () => {
    // From `should_wrap_prop_from_destructured_array` (OSS-363) territory.
    // Mirrors the prior `walkPatternInit` per-elem classification.
    const source = `function f() { const [store, math] = [useStore(), Math.random()]; use(store); }`;
    const { bindings, source: src } = setup(source);
    // `store` paired with `useStore()` — isReturnStatic → const
    expect(bindings.classify('store', src.indexOf('use(store)') + 4)).toBe('const');
    // `math` paired with `Math.random()` — NOT isReturnStatic (CallExpression
    // whose callee is a MemberExpression, not an identifier ending in $/Qrl
    // or starting with `use`) → var
    expect(bindings.classify('math', src.indexOf('use(store)') + 4)).toBe('var');
  });
});

// ---------------------------------------------------------------------------
// computeJsxFlags
// ---------------------------------------------------------------------------

describe('computeJsxFlags', () => {
  it('returns 3 for no varProps + static children (fully immutable)', () => {
    expect(computeJsxFlags(false, 'static')).toBe(3);
  });

  it('returns 1 for no varProps + dynamic children', () => {
    expect(computeJsxFlags(false, 'dynamic')).toBe(1);
  });

  it('returns 3 for varProps + static children (bit 0 always set outside loop)', () => {
    // Outside loop context, bit 0 is always set regardless of varProps
    expect(computeJsxFlags(true, 'static')).toBe(3);
  });

  it('returns 1 for varProps + dynamic children (bit 0 always set outside loop)', () => {
    // Outside loop context, bit 0 is always set regardless of varProps
    expect(computeJsxFlags(true, 'dynamic')).toBe(1);
  });

  it('returns 3 for no varProps + no children', () => {
    expect(computeJsxFlags(false, 'none')).toBe(3);
  });

  it('returns 3 for varProps + no children (bit 0 always set outside loop)', () => {
    // Outside loop context, bit 0 is always set regardless of varProps
    expect(computeJsxFlags(true, 'none')).toBe(3);
  });

  it('returns 4 for varProps + dynamic children in loop context', () => {
    // In loop context with varProps: bit 2 set, bit 0 NOT set
    expect(computeJsxFlags(true, 'dynamic', true)).toBe(4);
  });

  it('returns 7 for no varProps + static children in loop context', () => {
    // In loop context without varProps: all three bits set
    expect(computeJsxFlags(false, 'static', true)).toBe(7);
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
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
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
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
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
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.varProps).toContain('title: globalVar');
    expect(result!.constProps).toBeNull();
  });

  it('puts imported member expression props in varProps', () => {
    const source = '<div class={styles.foo}/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set(['styles']);
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.varProps).toContain('class: styles.foo');
    expect(result!.constProps).toBeNull();
  });

  it('handles self-closing elements with no children', () => {
    const source = '<div/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
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
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
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
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.tag).toBe('"div"');
  });

  it('extracts explicit key={value} as 6th arg', () => {
    const source = '<Cmp prop="23" key={props.stuff}/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    // Key should be the expression, not auto-generated u6_N
    expect(result!.key).toBe('props.stuff');
    // key should NOT appear in constProps or varProps
    expect(result!.constProps).not.toContain('key');
  });

  it('extracts explicit key="stuff" as string literal', () => {
    const source = '<Cmp key="stuff"/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.key).toBe('"stuff"');
  });

  it('handles multiple children as array', () => {
    const source = '<div><span/><span/><span/></div>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    // Multiple children should produce array-like output
    expect(result!.children).toContain('[');
    expect(result!.children).toContain(']');
  });

  it('handles single child directly (not array)', () => {
    const source = '<div><p/></div>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    // Single child should NOT be in an array
    expect(result!.children).not.toMatch(/^\[/);
  });

  it('handles spread props with _jsxSplit', () => {
    const source = '<button {...props}/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.callString).toContain('_jsxSplit');
    expect(result!.callString).toContain('_getVarProps(props)');
    expect(result!.callString).toContain('_getConstProps(props)');
    expect(result!.flags).toBe(0);
    expect(result!.neededImports.has('_jsxSplit')).toBe(true);
    expect(result!.neededImports.has('_getVarProps')).toBe(true);
    expect(result!.neededImports.has('_getConstProps')).toBe(true);
  });

  it('handles JSXMemberExpression tag (Foo.Bar)', () => {
    const source = '<Foo.Bar/>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxElement(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.tag).toBe('Foo.Bar');
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
    const jsxNode = (program.body[0] as any).expression;
    const nameNode = jsxNode.openingElement.name;
    expect(processJsxTag(nameNode)).toBe('"div"');
  });

  it('returns identifier for component elements', () => {
    const source = '<MyComponent/>';
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const nameNode = jsxNode.openingElement.name;
    expect(processJsxTag(nameNode)).toBe('MyComponent');
  });

  it('returns dotted path for member expressions', () => {
    const source = '<Foo.Bar/>';
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
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
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxFragment(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result).toBeDefined();
    expect(result!.tag).toBe('_Fragment');
    expect(result!.callString).toContain('_jsxSorted(_Fragment');
    expect(result!.children).toBe('"child"');
    expect(result!.neededImports.has('_jsxSorted')).toBe(true);
  });

  it('transforms fragment with multiple children to array', () => {
    const source = '<><div/><span/></>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const jsxNode = (program.body[0] as any).expression;
    const importedNames = new Set<string>();
    const keyCounter = new JsxKeyCounter();

    const result = transformJsxFragment(
      makeCtx(source, s, importedNames, keyCounter),
      jsxNode,
    );

    expect(result!.children).toContain('[');
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
    const importedNames = new Set<string>();

    const output = transformAllJsx({ source, s, program, importedNames });

    const result = s.toString();
    // Inner <p> should be transformed first, then outer <div>
    expect(result).toContain('_jsxSorted');
    expect(output.neededImports.has('_jsxSorted')).toBe(true);
  });

  it('sets needsFragment for fragment nodes', () => {
    const source = '<>child</>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const importedNames = new Set<string>();

    const output = transformAllJsx({ source, s, program, importedNames });

    expect(output.needsFragment).toBe(true);
  });

  it('adds PURE annotation to transformed calls', () => {
    const source = '<div class="foo">bar</div>';
    const s = new MagicString(source);
    const { program } = parseSync('test.tsx', source);
    const importedNames = new Set<string>();

    const output = transformAllJsx({ source, s, program, importedNames });

    const result = s.toString();
    expect(result).toContain('/*#__PURE__*/');
  });
});
