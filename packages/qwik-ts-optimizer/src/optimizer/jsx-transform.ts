/**
 * JSX element transformation module for the Qwik optimizer.
 *
 * Converts JSX syntax to _jsxSorted/_jsxSplit function calls with
 * correct prop classification (varProps/constProps), flags computation,
 * key generation, spread handling, and fragment support.
 *
 * Implements: JSX-01, JSX-02, JSX-03, JSX-04, JSX-05, JSX-06
 */

import type MagicString from 'magic-string';
import { walk } from 'oxc-walker';
import { analyzeSignalExpression, SignalHoister, type SignalExprResult } from './signal-analysis.js';
import { transformEventPropName, isEventProp, isPassiveDirective, collectPassiveDirectives } from './event-handler-transform.js';
import { isBindProp, transformBindProp, mergeEventHandlers } from './bind-transform.js';
import { detectLoopContext, buildQpProp, type LoopContext } from './loop-hoisting.js';
import { computeKeyPrefix } from './key-prefix.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JsxTransformResult {
  /** Tag representation: string literal for HTML, identifier for components */
  tag: string;
  /** Mutable props object literal string, or null */
  varProps: string | null;
  /** Immutable props object literal string, or null */
  constProps: string | null;
  /** Children representation, or null */
  children: string | null;
  /** Flags bitmask */
  flags: number;
  /** Key value (string literal, expression, or null) */
  key: string | null;
  /** Full replacement call string */
  callString: string;
  /** Needed imports (e.g., _jsxSorted, _Fragment) */
  neededImports: Set<string>;
}

export interface JsxTransformOutput {
  /** Imports needed (_jsxSorted, _Fragment, _jsxSplit, etc.) */
  neededImports: Set<string>;
  /** Whether _Fragment is needed from jsx-runtime */
  needsFragment: boolean;
  /** Hoisted signal function declarations (const _hf0 = ...; const _hf0_str = ...;) */
  hoistedDeclarations: string[];
  /** Final key counter value (for continuation in subsequent transforms) */
  keyCounterValue: number;
}

// ---------------------------------------------------------------------------
// Global identifiers that indicate mutable context
// ---------------------------------------------------------------------------

const GLOBAL_OBJECTS = new Set([
  'window',
  'document',
  'globalThis',
  'navigator',
  'location',
  'history',
  'screen',
  'localStorage',
  'sessionStorage',
  'console',
]);

// ---------------------------------------------------------------------------
// classifyProp
// ---------------------------------------------------------------------------

/**
 * Analyze an expression AST node to determine if it is immutable (const)
 * or mutable (var).
 *
 * Immutability rules (per D-JSX-02 from RESEARCH.md):
 * - CONST: string/number/boolean/null/undefined literals, template literals
 *   without expressions, imported identifiers, member expressions where
 *   object is imported, CSS module refs, ternary/binary with all-const
 *   operands, _wrapProp/_fnSignal calls, array/object literals with all-const
 * - VAR: globals (not in importedNames), window/document/globalThis members,
 *   function calls with unknown side effects, signal.value, expressions
 *   containing a VAR sub-expression
 *
 * @param exprNode - AST expression node
 * @param importedNames - Set of imported identifier names
 * @param localNames - Optional set of locally declared names (treated as var)
 * @returns 'const' or 'var'
 */
export function classifyProp(
  exprNode: any,
  importedNames: Set<string>,
  localNames?: Set<string>,
): 'const' | 'var' {
  if (!exprNode) return 'const';

  switch (exprNode.type) {
    // --- Literals: always const ---
    case 'StringLiteral':
    case 'Literal':
      return 'const';

    case 'NumericLiteral':
      return 'const';

    case 'BooleanLiteral':
      return 'const';

    case 'NullLiteral':
      return 'const';

    // --- Template literals ---
    case 'TemplateLiteral':
      if (!exprNode.expressions || exprNode.expressions.length === 0) {
        return 'const';
      }
      // All expressions must be const
      for (const expr of exprNode.expressions) {
        if (classifyProp(expr, importedNames, localNames) === 'var') {
          return 'var';
        }
      }
      return 'const';

    // --- Identifiers ---
    case 'Identifier': {
      const name = exprNode.name;
      // undefined is const
      if (name === 'undefined') return 'const';
      // Imported names are const
      if (importedNames.has(name)) return 'const';
      // Everything else (local vars, globals) is var
      return 'var';
    }

    // --- Member expressions ---
    case 'MemberExpression':
    case 'StaticMemberExpression':
    case 'ComputedMemberExpression': {
      const obj = exprNode.object;
      // window.*, document.*, globalThis.* -> var
      if (obj?.type === 'Identifier' && GLOBAL_OBJECTS.has(obj.name)) {
        return 'var';
      }
      // If the object is imported, the whole member expr is const
      // (e.g., styles.foo, dep.thing)
      if (obj?.type === 'Identifier' && importedNames.has(obj.name)) {
        return 'const';
      }
      // For nested member expressions, check the root object
      if (
        obj?.type === 'MemberExpression' ||
        obj?.type === 'StaticMemberExpression'
      ) {
        return classifyProp(obj, importedNames, localNames);
      }
      // Unknown object -> var
      return 'var';
    }

    // --- Call expressions: always var (unknown side effects) ---
    case 'CallExpression':
      // Special case: _wrapProp and _fnSignal are always const
      if (exprNode.callee?.type === 'Identifier') {
        const name = exprNode.callee.name;
        if (name === '_wrapProp' || name === '_fnSignal') {
          return 'const';
        }
      }
      return 'var';

    // --- Unary expressions ---
    case 'UnaryExpression':
      // typeof is always const (no runtime side effect)
      if (exprNode.operator === 'typeof') return 'const';
      return classifyProp(exprNode.argument, importedNames, localNames);

    // --- Binary expressions ---
    case 'BinaryExpression':
    case 'LogicalExpression': {
      const leftClass = classifyProp(exprNode.left, importedNames, localNames);
      const rightClass = classifyProp(
        exprNode.right,
        importedNames,
        localNames,
      );
      return leftClass === 'var' || rightClass === 'var' ? 'var' : 'const';
    }

    // --- Conditional (ternary) ---
    case 'ConditionalExpression': {
      const testClass = classifyProp(exprNode.test, importedNames, localNames);
      const consClass = classifyProp(
        exprNode.consequent,
        importedNames,
        localNames,
      );
      const altClass = classifyProp(
        exprNode.alternate,
        importedNames,
        localNames,
      );
      return testClass === 'var' || consClass === 'var' || altClass === 'var'
        ? 'var'
        : 'const';
    }

    // --- Object expression ---
    case 'ObjectExpression': {
      if (!exprNode.properties) return 'const';
      for (const prop of exprNode.properties) {
        if (prop.type === 'SpreadElement') {
          if (classifyProp(prop.argument, importedNames, localNames) === 'var')
            return 'var';
        } else if (prop.value) {
          if (classifyProp(prop.value, importedNames, localNames) === 'var')
            return 'var';
        }
      }
      return 'const';
    }

    // --- Array expression ---
    case 'ArrayExpression': {
      if (!exprNode.elements) return 'const';
      for (const el of exprNode.elements) {
        if (el === null) continue; // holes are const
        if (el.type === 'SpreadElement') {
          if (classifyProp(el.argument, importedNames, localNames) === 'var')
            return 'var';
        } else {
          if (classifyProp(el, importedNames, localNames) === 'var')
            return 'var';
        }
      }
      return 'const';
    }

    // --- Arrow/function expressions: const (they are values) ---
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      return 'const';

    // --- Parenthesized ---
    case 'ParenthesizedExpression':
      return classifyProp(exprNode.expression, importedNames, localNames);

    // --- Sequence expression (comma) ---
    case 'SequenceExpression': {
      // Last expression determines the type, but if any is var, it's var
      for (const expr of exprNode.expressions) {
        if (classifyProp(expr, importedNames, localNames) === 'var')
          return 'var';
      }
      return 'const';
    }

    default:
      // Unknown node type -> assume var for safety
      return 'var';
  }
}

// ---------------------------------------------------------------------------
// computeFlags
// ---------------------------------------------------------------------------

/**
 * Compute the flags bitmask for a JSX element.
 *
 * - Bit 0 (1): children are static/const (set when no dynamic children)
 * - Bit 1 (2): props are immutable (set when NO varProps)
 * - Bit 2 (4): loop context
 *
 * Common values:
 * - 3 (0b011): fully immutable (no varProps + const children)
 * - 1 (0b001): const children only, has varProps... wait no.
 *
 * Correction from snapshots:
 * - 3 = no varProps + static/no children
 * - 1 = no varProps + dynamic children (children flag bit NOT set)
 * - 2 = has varProps + static/no children
 * - 0 = spread or has varProps + dynamic children
 *
 * Wait, let me re-read the snapshot evidence:
 * - `<div class="class">12</div>` -> flags=3 (string child, all const props)
 * - `<div class="class">{children}</div>` -> flags=1 (dynamic child, all const props)
 * - `<Div document={window.document} ...>` -> flags=2 (has varProps)
 * - `_jsxSplit(...)` -> flags=0 (spread)
 *
 * So: bit 0 (1) = children are static text/const, bit 1 (2) = no varProps
 * flags = (childrenStatic ? 1 : 0) | (noVarProps ? 2 : 0) | (inLoop ? 4 : 0)
 *
 * @param hasVarProps - Whether the element has any mutable props
 * @param childrenType - 'none' | 'static' | 'dynamic'
 * @param inLoop - Whether the element is inside a loop context
 * @returns Flags bitmask integer
 */
export function computeFlags(
  hasVarProps: boolean,
  childrenType: 'none' | 'static' | 'dynamic',
  inLoop: boolean = false,
): number {
  // Evidence from Rust snapshot corpus:
  //   flags=3: static/no children, no loop (bit 0 + bit 1)
  //   flags=1: dynamic children, no loop (bit 0 only)
  //   flags=4: loop context with q:p + varProps + dynamic children (bit 2 only)
  //
  // Outside loop context: bit 0 is ALWAYS set regardless of varProps.
  // Inside loop context (q:p): bit 0 reflects whether props are immutable.
  let flags = 0;
  // Bit 0 (value 1): immutable props. Always set outside loop; inside loop, only if no varProps.
  if (!inLoop || !hasVarProps) {
    flags |= 1;
  }
  // Bit 1 (value 2): children are static (text, const expressions, no children)
  if (childrenType !== 'dynamic') {
    flags |= 2;
  }
  // Bit 2 (value 4): loop context
  if (inLoop) {
    flags |= 4;
  }
  return flags;
}

// ---------------------------------------------------------------------------
// JsxKeyCounter
// ---------------------------------------------------------------------------

/**
 * Per-module counter for generating deterministic JSX element keys.
 * Keys follow the pattern "{prefix}_{N}" where prefix is derived from
 * the file path hash (e.g., "u6" for test.tsx, "KD" for components/apps/apps.tsx).
 */
export class JsxKeyCounter {
  private count: number;
  private prefix: string;

  constructor(startAt = 0, prefix = 'u6') {
    this.count = startAt;
    this.prefix = prefix;
  }

  /**
   * Generate the next key value.
   * @returns Key string like "u6_0", "KD_1", etc.
   */
  next(): string {
    return `${this.prefix}_${this.count++}`;
  }

  /** Get the current counter value (for continuation). */
  current(): number {
    return this.count;
  }

  /** Reset the counter (e.g., for a new module). */
  reset(): void {
    this.count = 0;
  }
}

// ---------------------------------------------------------------------------
// JSX tag processing
// ---------------------------------------------------------------------------

/**
 * Check if a tag name represents an HTML element (lowercase).
 */
export function isHtmlElement(tagName: string): boolean {
  return tagName.length > 0 && tagName[0] === tagName[0].toLowerCase();
}

/**
 * Extract tag representation from a JSX opening element name node.
 *
 * - JSXIdentifier with lowercase name -> `"div"` (string literal)
 * - JSXIdentifier with uppercase name -> `Div` (identifier reference)
 * - JSXMemberExpression -> `Foo.Bar` (dotted path)
 * - JSXNamespacedName -> `"ns:name"` (string literal)
 */
export function processJsxTag(nameNode: any): string {
  if (!nameNode) return '"div"';

  switch (nameNode.type) {
    case 'JSXIdentifier': {
      const name = nameNode.name;
      if (isHtmlElement(name)) {
        return `"${name}"`;
      }
      return name;
    }
    case 'JSXMemberExpression': {
      const parts: string[] = [];
      let current = nameNode;
      while (current.type === 'JSXMemberExpression') {
        parts.unshift(current.property.name);
        current = current.object;
      }
      if (current.type === 'JSXIdentifier') {
        parts.unshift(current.name);
      }
      return parts.join('.');
    }
    case 'JSXNamespacedName':
      return `"${nameNode.namespace.name}:${nameNode.name.name}"`;
    default:
      return '"div"';
  }
}

// ---------------------------------------------------------------------------
// Children processing
// ---------------------------------------------------------------------------

/**
 * Process JSX children nodes and return a children string representation.
 *
 * - No children -> null
 * - Single text child -> quoted string
 * - Single expression child -> expression text
 * - Multiple children -> array
 */
function processChildren(
  children: any[],
  source: string,
  s?: import('magic-string').default,
  importedNames?: Set<string>,
  signalHoister?: SignalHoister,
  neededImports?: Set<string>,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (!children || children.length === 0) {
    return { text: null, type: 'none' };
  }

  // Filter out empty/whitespace-only JSXText nodes, but preserve
  // whitespace-only text between non-text siblings as " " (standard JSX behavior)
  const meaningful: any[] = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type === 'JSXText') {
      const trimmed = child.value?.trim();
      if (trimmed) {
        meaningful.push({ ...child, _trimmedText: trimmed });
      }
      // Whitespace-only JSXText between siblings is stripped (matching Rust optimizer)
    } else {
      meaningful.push(child);
    }
  }

  if (meaningful.length === 0) {
    return { text: null, type: 'none' };
  }

  if (meaningful.length === 1) {
    const child = meaningful[0];
    return processOneChild(child, source, s, importedNames, signalHoister, neededImports);
  }

  // Multiple children -> array
  const parts: string[] = [];
  let isDynamic = false;
  for (const child of meaningful) {
    const { text, type } = processOneChild(child, source, s, importedNames, signalHoister, neededImports);
    if (text !== null) {
      parts.push(text);
    }
    if (type === 'dynamic') isDynamic = true;
  }

  return {
    text: `[${parts.join(', ')}]`,
    type: isDynamic ? 'dynamic' : 'static',
  };
}

/**
 * Process a single child node and return its text representation.
 */
function processOneChild(
  child: any,
  source: string,
  s?: import('magic-string').default,
  importedNames?: Set<string>,
  signalHoister?: SignalHoister,
  neededImports?: Set<string>,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (child._trimmedText) {
    return { text: `"${child._trimmedText}"`, type: 'static' };
  }

  if (child.type === 'JSXText') {
    const trimmed = child.value?.trim();
    if (!trimmed) return { text: null, type: 'none' };
    return { text: `"${trimmed}"`, type: 'static' };
  }

  if (child.type === 'JSXExpressionContainer') {
    const expr = child.expression;
    if (!expr || expr.type === 'JSXEmptyExpression') {
      return { text: null, type: 'none' };
    }
    // Use MagicString buffer if available (picks up inner JSX transforms)
    const exprText = s ? s.slice(expr.start, expr.end) : source.slice(expr.start, expr.end);
    // Check if expression is a literal
    if (
      expr.type === 'StringLiteral' ||
      expr.type === 'NumericLiteral' ||
      expr.type === 'BooleanLiteral' ||
      (expr.type === 'Literal' &&
        (typeof expr.value === 'string' ||
          typeof expr.value === 'number' ||
          typeof expr.value === 'boolean'))
    ) {
      return { text: exprText, type: 'static' };
    }

    // Signal analysis for children expressions
    if (importedNames && signalHoister) {
      const signalResult = analyzeSignalExpression(expr, source, importedNames);
      if (signalResult.type === 'wrapProp') {
        neededImports?.add('_wrapProp');
        return { text: signalResult.code, type: 'static' };
      }
      if (signalResult.type === 'fnSignal') {
        const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr);
        const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
        neededImports?.add('_fnSignal');
        // _fnSignal children are dynamic (reactive signal expressions)
        return { text: fnSignalCall, type: 'dynamic' };
      }
    }

    return { text: exprText, type: 'dynamic' };
  }

  if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
    // Nested JSX — use MagicString buffer to get already-transformed text
    // (bottom-up walk transforms inner elements first).
    // Classified as 'dynamic' because after transpilation these become _jsxSorted()
    // function calls, which the Rust optimizer treats as non-static children.
    const childText = s ? s.slice(child.start, child.end) : source.slice(child.start, child.end);
    return { text: childText, type: 'dynamic' };
  }

  return { text: null, type: 'none' };
}

// ---------------------------------------------------------------------------
// Props processing
// ---------------------------------------------------------------------------

/**
 * Process JSX attributes and classify them into varProps and constProps.
 * Integrates signal analysis, event handler naming, and bind desugaring.
 * Returns the key prop value if found.
 */
function processProps(
  attributes: any[],
  source: string,
  importedNames: Set<string>,
  tagIsHtml: boolean,
  passiveEvents: Set<string>,
  signalHoister: SignalHoister,
  inLoop?: boolean,
  qrlsWithCaptures?: Set<string>,
  paramNames?: Set<string>,
): {
  varEntries: string[];
  constEntries: string[];
  beforeSpreadEntries: string[];
  key: string | null;
  hasVarProps: boolean;
  hasSpread: boolean;
  neededImports: Set<string>;
} {
  const varEntries: string[] = [];
  const constEntries: string[] = [];
  const beforeSpreadEntries: string[] = []; // Props before spread go here
  const neededImports = new Set<string>();
  let key: string | null = null;
  let hasSpread = false;

  // Track bind handlers for merging (event name -> handler code)
  const bindHandlers = new Map<string, string>();

  if (!attributes || attributes.length === 0) {
    return { varEntries, constEntries, beforeSpreadEntries, key, hasVarProps: false, hasSpread, neededImports };
  }

  // Pre-scan for spreads so bind gate works regardless of attribute order
  const hasSpreadAttr = attributes.some(a => a.type === 'JSXSpreadAttribute');
  // Track index of the spread attribute for ordering classification
  const spreadIndex = attributes.findIndex(a => a.type === 'JSXSpreadAttribute');

  for (let attrIdx = 0; attrIdx < attributes.length; attrIdx++) {
    const attr = attributes[attrIdx];
    // In spread mode, non-event/non-signal props that appear BEFORE the spread
    // go to varEntries (they must precede _getVarProps in evaluation order)
    const beforeSpread = hasSpreadAttr && attrIdx < spreadIndex;
    if (attr.type === 'JSXSpreadAttribute') {
      hasSpread = true;
      continue;
    }

    if (attr.type !== 'JSXAttribute') continue;

    let propName: string | undefined;
    if (attr.name?.type === 'JSXNamespacedName') {
      propName = `${attr.name.namespace.name}:${attr.name.name.name}`;
    } else {
      propName = attr.name?.name;
    }

    if (!propName) continue;

    // className -> class conversion for HTML elements (matching Rust optimizer behavior)
    // Component elements keep className as-is
    if (propName === 'className' && tagIsHtml) {
      propName = 'class';
    }

    // Extract key prop
    if (propName === 'key') {
      if (attr.value) {
        if (attr.value.type === 'JSXExpressionContainer') {
          key = source.slice(
            attr.value.expression.start,
            attr.value.expression.end,
          );
        } else if (
          attr.value.type === 'StringLiteral' ||
          attr.value.type === 'Literal'
        ) {
          key = `"${attr.value.value}"`;
        }
      }
      continue; // key is not included in props
    }

    // --- (a) Strip passive: directives ---
    if (isPassiveDirective(propName)) {
      continue; // consumed by collectPassiveDirectives, not in output
    }

    // Get value expression
    let valueText: string;
    let valueNode: any;

    if (attr.value === null || attr.value === undefined) {
      // Boolean shorthand: <div disabled/> -> disabled: true
      valueText = 'true';
      valueNode = null;
    } else if (attr.value.type === 'JSXExpressionContainer') {
      valueNode = attr.value.expression;
      valueText = source.slice(valueNode.start, valueNode.end);
    } else {
      // String literal value
      valueNode = attr.value;
      valueText = source.slice(attr.value.start, attr.value.end);
    }

    // --- (b) Bind desugaring ---
    if (isBindProp(propName) && !hasSpreadAttr) {
      const bindResult = transformBindProp(propName, valueText);
      // Bind-desugared prop names are always quoted (matching Rust optimizer)
      const formattedBindName = `"${bindResult.propName}"`;
      constEntries.push(`${formattedBindName}: ${bindResult.propValue}`);
      if (bindResult.handler) {
        // Track bind handler for merging.
        // When an explicit event handler (QRL) already exists, bind handler
        // comes AFTER it: [explicitQrl, inlinedQrl(...)]. Otherwise just store.
        const existing = bindHandlers.get(bindResult.handler.name);
        if (existing) {
          // Explicit handler first, bind handler second
          bindHandlers.set(
            bindResult.handler.name,
            `[${existing}, ${bindResult.handler.code}]`,
          );
        } else {
          bindHandlers.set(bindResult.handler.name, bindResult.handler.code);
        }
      }
      for (const imp of bindResult.needsImport) {
        neededImports.add(imp);
      }
      continue;
    }

    // In spread/split mode, bind props pass through un-desugared into varEntries
    if (isBindProp(propName) && hasSpreadAttr) {
      varEntries.push(`"${propName}": ${valueText}`);
      continue;
    }

    // --- (c) Event prop renaming (HTML elements only) ---
    if (isEventProp(propName) && tagIsHtml) {
      const renamedProp = transformEventPropName(propName, passiveEvents);
      if (renamedProp !== null) {
        const formattedName = needsQuoting(renamedProp)
          ? `"${renamedProp}"`
          : renamedProp;
        constEntries.push(`${formattedName}: ${valueText}`);
        continue;
      }
    }

    // Pre-rewritten event props (q-e:* from transformSCallBody / extraction rewriting).
    // These are already-renamed event handler props pointing to QRL variables.
    if (propName.startsWith('q-e:') || propName.startsWith('q-ep:') || propName.startsWith('q-dp:') || propName.startsWith('q-wp:')) {
      const formattedName = `"${propName}"`;
      if (inLoop) {
        if (qrlsWithCaptures) {
          // Per-QRL classification: event handlers whose QRL has loop-local captures
          // go to varEntries (they need q:p delivery). Others go to constEntries.
          const qrlName = valueText.trim();
          if (qrlsWithCaptures.has(qrlName)) {
            varEntries.push(`${formattedName}: ${valueText}`);
          } else {
            constEntries.push(`${formattedName}: ${valueText}`);
          }
        } else {
          varEntries.push(`${formattedName}: ${valueText}`);
        }
      } else {
        // Outside loop: track for merging with bind handlers.
        // Pre-rewritten QRL refs go to the event handler merge map so they can
        // be combined with bind-generated handlers into arrays.
        const eventKey = propName;  // e.g., "q-e:input"
        const existing = bindHandlers.get(eventKey);
        if (existing) {
          // Bind handler was already registered -- merge preserving attribute order:
          // bind came first, QRL second -> [bind, qrl]
          bindHandlers.set(eventKey, `[${existing}, ${valueText}]`);
        } else {
          // Store QRL for potential merge with later bind handler
          bindHandlers.set(eventKey, valueText);
        }
      }
      continue;
    }

    // --- (d) Signal analysis ---
    if (valueNode) {
      // For signal analysis, augment importedNames with paramNames so function
      // parameters (like 'props') are excluded from reactive store detection.
      // This prevents _fnSignal wrapping for props.field in component segments.
      const signalImports = paramNames && paramNames.size > 0
        ? new Set([...importedNames, ...paramNames])
        : importedNames;
      const signalResult = analyzeSignalExpression(valueNode, source, signalImports);
      if (signalResult.type === 'wrapProp') {
        const formattedName = needsQuoting(propName)
          ? `"${propName}"`
          : propName;
        // Store field _wrapProp (2-arg form like _wrapProp(obj, "field")):
        //   - HTML elements: goes to varEntries (reactive store access)
        //   - Component elements: goes to constEntries (Rust optimizer behavior)
        // Signal _wrapProp (1-arg form like _wrapProp(signal)) always goes to constEntries
        if (signalResult.isStoreField && tagIsHtml) {
          varEntries.push(`${formattedName}: ${signalResult.code}`);
        } else {
          constEntries.push(`${formattedName}: ${signalResult.code}`);
        }
        neededImports.add('_wrapProp');
        continue;
      }
      if (signalResult.type === 'fnSignal') {
        const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr);
        const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
        const formattedName = needsQuoting(propName)
          ? `"${propName}"`
          : propName;
        // For component elements in loop context, _fnSignal props that depend
        // on iteration variables go to varEntries (Rust optimizer behavior).
        // This handles cases like .map((item) => <Comp prop={item.field} />)
        if (!tagIsHtml && inLoop) {
          varEntries.push(`${formattedName}: ${fnSignalCall}`);
        } else {
          constEntries.push(`${formattedName}: ${fnSignalCall}`);
        }
        neededImports.add('_fnSignal');
        continue;
      }
    }

    // --- (e) Existing classifyProp fallback ---
    const classification = valueNode
      ? classifyProp(valueNode, importedNames)
      : 'const'; // boolean shorthand (true) is const

    // Format the property name (quote if needed)
    const formattedName = needsQuoting(propName)
      ? `"${propName}"`
      : propName;

    const entry = `${formattedName}: ${valueText}`;

    if (beforeSpread) {
      // Props before a spread go to beforeSpreadEntries (placed before _getVarProps)
      beforeSpreadEntries.push(entry);
    } else if (classification === 'var') {
      varEntries.push(entry);
    } else {
      constEntries.push(entry);
    }
  }

  // --- After loop: merge bind handlers into constEntries ---
  for (const [eventName, handlerCode] of bindHandlers) {
    // Check if there's an existing handler entry for this event in constEntries
    const quotedEventName = `"${eventName}"`;
    const existingIdx = constEntries.findIndex((e) => e.startsWith(`${quotedEventName}: `));
    if (existingIdx >= 0) {
      // Merge: existing handler + bind handler
      const existingEntry = constEntries[existingIdx];
      const existingValue = existingEntry.slice(quotedEventName.length + 2); // skip `"q-e:input": `
      constEntries[existingIdx] = `${quotedEventName}: ${mergeEventHandlers(existingValue, handlerCode)}`;
    } else {
      constEntries.push(`${quotedEventName}: ${handlerCode}`);
    }
  }

  return {
    varEntries,
    constEntries,
    beforeSpreadEntries,
    key,
    hasVarProps: varEntries.length > 0 || beforeSpreadEntries.length > 0,
    hasSpread,
    neededImports,
  };
}

/**
 * Check if a property name needs quoting in an object literal.
 */
function needsQuoting(name: string): boolean {
  // Names with special characters (hyphens, colons) need quoting
  return /[^a-zA-Z0-9_$]/.test(name);
}

// ---------------------------------------------------------------------------
// transformJsxElement
// ---------------------------------------------------------------------------

/**
 * Transform a single JSX element node to a _jsxSorted/_jsxSplit call.
 *
 * @param node - JSXElement AST node
 * @param source - Original source text
 * @param s - MagicString instance for replacements
 * @param importedNames - Set of imported identifier names
 * @param keyCounter - JsxKeyCounter for auto-key generation
 * @returns JsxTransformResult or null if not a JSX node
 */
export function transformJsxElement(
  node: any,
  source: string,
  s: MagicString,
  importedNames: Set<string>,
  keyCounter: JsxKeyCounter,
  passiveEvents?: Set<string>,
  signalHoister?: SignalHoister,
  loopCtx?: LoopContext | null,
  isSoleChild?: boolean,
  enableChildSignals: boolean = true,
  qpOverrides?: Map<number, string[]>,
  qrlsWithCaptures?: Set<string>,
  paramNames?: Set<string>,
): JsxTransformResult | null {
  if (node.type !== 'JSXElement') return null;

  const neededImports = new Set<string>();
  const openingElement = node.openingElement;

  // --- Tag ---
  const tag = processJsxTag(openingElement.name);

  // Determine if tag is an HTML element (lowercase first char)
  // tag is either `"div"` (string literal for HTML) or `Div` (identifier for component)
  const tagIsHtml = tag.startsWith('"') && tag.length > 2 &&
    tag[1] === tag[1].toLowerCase() && tag[1] >= 'a' && tag[1] <= 'z';

  // Collect passive directives for this element
  const elementPassiveEvents = passiveEvents ??
    collectPassiveDirectives(openingElement.attributes);

  // Use provided signalHoister or create a local one
  const hoister = signalHoister ?? new SignalHoister();

  // Determine if in loop context (needed for prop classification and q:p placement)
  const inLoop = !!loopCtx && loopCtx.iterVars.length > 0;

  // --- Props ---
  const {
    varEntries,
    constEntries,
    beforeSpreadEntries,
    key: explicitKey,
    hasVarProps,
    hasSpread,
    neededImports: propImports,
  } = processProps(openingElement.attributes, source, importedNames, tagIsHtml, elementPassiveEvents, hoister, inLoop, qrlsWithCaptures, paramNames);

  // Merge prop imports
  for (const imp of propImports) {
    neededImports.add(imp);
  }

  // --- Loop context: inject q:p/q:ps prop ---
  // q:p/q:ps is only added to elements that have event handlers with captures.
  // The qpOverrides map (from capture analysis) determines which elements get q:p/q:ps
  // and with what values. Elements without event handlers don't get q:p/q:ps.
  if (inLoop && tagIsHtml) {
    // Check for qpOverrides first (from capture analysis via nestedCallSites)
    const overrideParams = qpOverrides?.get(node.start);
    if (overrideParams && overrideParams.length > 0) {
      const qpResult = buildQpProp(overrideParams, true);
      if (qpResult) {
        const formattedQpName = needsQuoting(qpResult.propName)
          ? `"${qpResult.propName}"`
          : qpResult.propName;
        varEntries.push(`${formattedQpName}: ${qpResult.propValue}`);
      }
    } else if (!qpOverrides) {
      // No override system active (parent rewriting context, not segment body).
      // Fall back to iterVars-based q:p for all elements in loop.
      const qpResult = buildQpProp(loopCtx!.iterVars);
      if (qpResult) {
        const formattedQpName = needsQuoting(qpResult.propName)
          ? `"${qpResult.propName}"`
          : qpResult.propName;
        varEntries.push(`${formattedQpName}: ${qpResult.propValue}`);
      }
    }
    // When qpOverrides is present but no override for this element: element has no
    // event handlers with captures, so no q:p/q:ps is needed.
  }

  // --- Children ---
  // When child signals are disabled (no extractions / skip-transform mode), don't pass
  // importedNames or signalHoister to children processing so _wrapProp/_fnSignal
  // wrapping is skipped. This matches the Rust optimizer's behavior for lib mode
  // files where $() calls are preserved without segment extraction.
  const { text: childrenText, type: childrenType } = processChildren(
    node.children,
    source,
    s,
    enableChildSignals ? importedNames : undefined,
    enableChildSignals ? hoister : undefined,
    neededImports,
  );

  // --- Flags ---
  // Loop context flag (bit 2) is only set for HTML elements with q:p/q:ps (event handler captures).
  // Component elements in loops don't get the loop flag -- they use varEntries placement instead.
  const hasQpProp = varEntries.some(e => e.startsWith('"q:p"') || e.startsWith('"q:ps"'));
  const effectiveLoopCtx = tagIsHtml && (qpOverrides ? hasQpProp : !!loopCtx);
  const flags = hasSpread ? 0 : computeFlags(hasVarProps, childrenType, effectiveLoopCtx);

  // --- Key ---
  // Key assignment logic:
  // - If explicit key prop, use it
  // - If this element is the sole child of a parent JSX element, key is null
  // - Otherwise generate u6_N key
  let keyStr: string | null;
  if (explicitKey !== null) {
    keyStr = explicitKey;
  } else if (isSoleChild && tagIsHtml) {
    // HTML element that is a child of a parent JSX element/fragment: key is null.
    // Components (uppercase) always get generated keys even as children.
    // This matches Rust optimizer behavior.
    keyStr = null;
  } else {
    // Default: generate a key
    keyStr = `"${keyCounter.next()}"`;
  }

  // --- Build prop strings ---
  const varProps =
    varEntries.length > 0 ? `{ ${varEntries.join(', ')} }` : null;
  const constProps =
    constEntries.length > 0 ? `{ ${constEntries.join(', ')} }` : null;

  // --- Build call ---
  if (hasSpread) {
    neededImports.add('_jsxSplit');
    neededImports.add('_getVarProps');
    neededImports.add('_getConstProps');

    // Find the spread argument
    const spreadAttr = openingElement.attributes.find(
      (a: any) => a.type === 'JSXSpreadAttribute',
    );
    const spreadArg = spreadAttr
      ? source.slice(spreadAttr.argument.start, spreadAttr.argument.end)
      : 'props';

    // Build varPropsPart: beforeSpreadEntries come BEFORE _getVarProps, varEntries come AFTER
    const beforePart = beforeSpreadEntries.length > 0 ? `${beforeSpreadEntries.join(', ')}, ` : '';
    const afterPart = varEntries.length > 0 ? `, ${varEntries.join(', ')}` : '';
    const varPropsPart = `{ ${beforePart}..._getVarProps(${spreadArg})${afterPart} }`;
    const constPropsPart = constEntries.length > 0
      ? `{ ..._getConstProps(${spreadArg}), ${constEntries.join(', ')} }`
      : `_getConstProps(${spreadArg})`;

    const callString = `_jsxSplit(${tag}, ${varPropsPart}, ${constPropsPart}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;

    return {
      tag,
      varProps: varPropsPart,
      constProps: constPropsPart,
      children: childrenText,
      flags,
      key: keyStr,
      callString,
      neededImports,
    };
  }

  neededImports.add('_jsxSorted');
  const callString = `_jsxSorted(${tag}, ${varProps ?? 'null'}, ${constProps ?? 'null'}, ${childrenText ?? 'null'}, ${flags}, ${keyStr ?? 'null'})`;

  return {
    tag,
    varProps,
    constProps,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

/**
 * Transform a JSX fragment node to a _jsxSorted(_Fragment, ...) call.
 */
export function transformJsxFragment(
  node: any,
  source: string,
  s: MagicString,
  importedNames: Set<string>,
  keyCounter: JsxKeyCounter,
  isSoleChild?: boolean,
): JsxTransformResult | null {
  if (node.type !== 'JSXFragment') return null;

  const neededImports = new Set<string>();
  neededImports.add('_jsxSorted');

  // Process children
  const { text: childrenText, type: childrenType } = processChildren(
    node.children,
    source,
    s,
    importedNames,
    undefined,  // no signalHoister for fragments (no props to hoist from)
    undefined,
  );

  const flags = computeFlags(false, childrenType);
  // Fragments always get generated keys (even as children), matching Rust optimizer.
  // Only HTML elements get null keys when they are children of parent JSX.
  const keyStr = `"${keyCounter.next()}"`;

  const callString = `_jsxSorted(_Fragment, null, null, ${childrenText ?? 'null'}, ${flags}, ${keyStr})`;

  return {
    tag: '_Fragment',
    varProps: null,
    constProps: null,
    children: childrenText,
    flags,
    key: keyStr,
    callString,
    neededImports,
  };
}

// ---------------------------------------------------------------------------
// transformAllJsx (main entry point)
// ---------------------------------------------------------------------------

/**
 * Walk the AST bottom-up and transform all JSX nodes.
 *
 * Uses leave callback to ensure inner JSX is transformed before outer JSX.
 * Returns the set of needed imports.
 */
/**
 * Check if a node falls within any of the skip ranges.
 * Skip ranges represent already-rewritten regions (e.g., extracted $() calls).
 */
function isInSkipRange(
  nodeStart: number,
  nodeEnd: number,
  skipRanges: Array<{ start: number; end: number }>,
): boolean {
  for (const range of skipRanges) {
    if (nodeStart >= range.start && nodeEnd <= range.end) {
      return true;
    }
  }
  return false;
}

export function transformAllJsx(
  source: string,
  s: MagicString,
  program: any,
  importedNames: Set<string>,
  skipRanges?: Array<{ start: number; end: number }>,
  devOptions?: { relPath: string },
  keyCounterStart?: number,
  enableSignals: boolean = true,
  /** Override q:p/q:ps values for specific elements. Key is element tag start position in source. */
  qpOverrides?: Map<number, string[]>,
  /** Set of QRL variable names that have loop-local captures (for var/const prop classification) */
  qrlsWithCaptures?: Set<string>,
  /** Function parameter names -- excluded from signal analysis but classified as var in props */
  paramNames?: Set<string>,
  /** Relative file path for computing key prefix (defaults to "test.tsx") */
  relPath?: string,
): JsxTransformOutput {
  const prefix = relPath ? computeKeyPrefix(relPath) : 'u6';
  const keyCounter = new JsxKeyCounter(keyCounterStart ?? 0, prefix);
  const signalHoister = new SignalHoister();
  const neededImports = new Set<string>();
  let needsFragment = false;
  const ranges = skipRanges ?? [];

  // Dev mode: build source info suffix for JSX calls
  // Precompute line starts for efficient offset->line/col lookup
  let lineStarts: number[] | null = null;
  if (devOptions) {
    lineStarts = [0];
    for (let i = 0; i < source.length; i++) {
      if (source[i] === '\n') lineStarts.push(i + 1);
    }
  }

  function getDevSourceSuffix(nodeStart: number): string {
    if (!devOptions || !lineStarts) return '';
    // Binary search for line number
    let lo = 0, hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= nodeStart) lo = mid;
      else hi = mid - 1;
    }
    const lineNumber = lo + 1; // 1-indexed
    const columnNumber = nodeStart - lineStarts[lo] + 1; // 1-indexed
    return `, {\n    fileName: "${devOptions.relPath}",\n    lineNumber: ${lineNumber},\n    columnNumber: ${columnNumber}\n}`;
  }

  // Loop context tracking: stack of active loop contexts
  const loopStack: LoopContext[] = [];

  // Track which JSX nodes are children of a parent JSX element/fragment.
  // Child JSX elements get key=null instead of a generated key (only root elements get keys).
  const childJsxNodes = new WeakSet<object>();

  walk(program, {
    enter(node: any) {
      const loopCtx = detectLoopContext(node, source);
      if (loopCtx) {
        loopStack.push(loopCtx);
      }

      // Mark all JSX element/fragment children of JSX elements/fragments.
      // These get key=null since only root-level JSX gets generated keys.
      if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
        const children = node.children ?? [];
        for (const child of children) {
          if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
            childJsxNodes.add(child);
          }
        }
      }
    },
    leave(node: any) {
      // Check if leaving a loop node — pop from stack
      if (loopStack.length > 0 && loopStack[loopStack.length - 1].loopNode === node) {
        loopStack.pop();
      }

      // Skip JSX nodes that fall within already-rewritten extraction ranges
      if (ranges.length > 0 && isInSkipRange(node.start, node.end, ranges)) {
        return;
      }

      // Current loop context (top of stack, or null)
      const currentLoop = loopStack.length > 0 ? loopStack[loopStack.length - 1] : null;

      if (node.type === 'JSXElement') {
        // Collect passive directives for this element
        const passiveEvents = collectPassiveDirectives(
          node.openingElement?.attributes ?? [],
        );

        // Check if this element is a child of a parent JSX element/fragment
        const isSoleChild = childJsxNodes.has(node);

        const result = transformJsxElement(
          node,
          source,
          s,
          importedNames,
          keyCounter,
          passiveEvents,
          signalHoister,
          currentLoop,
          isSoleChild,
          enableSignals,
          qpOverrides,
          qrlsWithCaptures,
          paramNames,
        );
        if (result) {
          const devSuffix = getDevSourceSuffix(node.start);
          // Insert dev source info before closing paren of callString
          const callStr = devSuffix
            ? result.callString.slice(0, -1) + devSuffix + ')'
            : result.callString;
          s.overwrite(
            node.start,
            node.end,
            `/*#__PURE__*/ ${callStr}`,
          );
          for (const imp of result.neededImports) {
            neededImports.add(imp);
          }
        }
      } else if (node.type === 'JSXFragment') {
        const isChildFragment = childJsxNodes.has(node);
        const result = transformJsxFragment(
          node,
          source,
          s,
          importedNames,
          keyCounter,
          isChildFragment,
        );
        if (result) {
          const devSuffix = getDevSourceSuffix(node.start);
          const callStr = devSuffix
            ? result.callString.slice(0, -1) + devSuffix + ')'
            : result.callString;
          s.overwrite(
            node.start,
            node.end,
            `/*#__PURE__*/ ${callStr}`,
          );
          for (const imp of result.neededImports) {
            neededImports.add(imp);
          }
          needsFragment = true;
        }
      }
    },
  });

  // Get hoisted signal declarations
  const hoistedDeclarations = signalHoister.getDeclarations();

  return { neededImports, needsFragment, hoistedDeclarations, keyCounterValue: keyCounter.current() };
}
