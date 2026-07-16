/**
 * Raw props transformation for component$ extractions.
 *
 * Rewrites destructured parameters like ({field1, field2}) => ...
 * to (_rawProps) => ... _rawProps.field1 ... for signal analysis.
 * Also handles body-level destructuring, rest elements, and
 * .w() call consolidation.
 */

import type {
  AstCompatNode,
  ArrayExpression,
  BindingProperty,
  CallExpression,
  AstMaybeNode,
  AstNode,
} from '../../ast-types.js';
import { buildPropertyAccessor } from '../ast/identifier-name.js';
import { rewritePropsFieldReferences } from './props-field-rewrite.js';
import {
  forEachAstChild,
  getAssignedIdentifierName,
  type AstIdentifierNode,
  type AstRangedNode,
  getObjectPropertyKeyName,
  getPatternProperties,
  hasRange,
  isAssignmentPatternNode,
  isAstNode,
  isIdentifierNode,
  isRangedIdentifierNode,
  isRestElementNode,
  isPropertyNode,
  isVariableDeclaratorNode,
} from '../ast/guards.js';
import {
  createFunctionTransformSession,
  createTransformSession,
  insertFunctionBodyPrologue,
  type FunctionTransformSession,
  type TransformSession,
} from '../edit/transform-session.js';
import {
  collectRangeReplacements,
  expressionNeedsParens,
  isReplaceableIdentifierPosition,
  type RangeReplacementCollector,
} from '../edit/range-replace.js';
import type { DevSuffixOptions } from '../jsx/jsx.js';

function isRawPropsMemberExpression(node: unknown): node is AstCompatNode & { object: AstIdentifierNode } {
  return (
    isAstNode(node) &&
    (node.type === 'MemberExpression' || node.type === 'StaticMemberExpression') &&
    isIdentifierNode(node.object) &&
    node.object.name === '_rawProps'
  );
}

function isWCallWithArrayArg(
  node: unknown,
): node is CallExpression & { arguments: [ArrayExpression & AstRangedNode] } {
  if (!isAstNode(node) || node.type !== 'CallExpression') return false;
  if (!isAstNode(node.callee) || node.callee.type !== 'MemberExpression') return false;
  if (!isIdentifierNode(node.callee.property) || node.callee.property.name !== 'w') return false;
  if (!Array.isArray(node.arguments) || node.arguments.length !== 1) return false;
  const arg = node.arguments[0];
  return isAstNode(arg) && arg.type === 'ArrayExpression' && hasRange(arg);
}

/**
 * Options for JSX transpilation within inline .s() body text.
 */
export interface InlineSegmentJsxOptions {
  /** Whether to apply JSX transpilation */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Dev mode options for JSX source info */
  devOptions?: DevSuffixOptions;
  /**
   * Original module source string, used to compute source-relative
   * `lineNumber:` / `columnNumber:` on JSX dev-info. Combined with the
   * per-extraction `loc[0]` and the inline-body wrapper-prefix length to
   * build a {@link DevInfoSourcePosition} at the `transformAllJsx` call.
   * Only required when `devOptions` is set.
   */
  source?: string;
  /** Starting key counter value (for continuation from module-level JSX) */
  keyCounterStart?: number;
  /** Relative file path for key prefix derivation */
  relPath?: string;
}

interface IdentifierReplacement {
  start: number;
  end: number;
  key: string;
  local: string;
  isShorthand?: boolean;
  /** Parent context requires `(<accessor> ?? <default>)` wrap. */
  needsParens?: boolean;
}

interface RawPropsField {
  key: string;
  local: string;
  defaultValue?: string;
}

interface RawPropsBindingInfo {
  fields: RawPropsField[];
  restElementName: string | null;
  /**
   * True when the pattern contains a shape consolidation cannot safely
   * express via `_rawProps.<key>` rewrites:
   *   - Property value is a nested ObjectPattern / ArrayPattern
   *     (e.g. `{ stuff: { hey } }`)
   *   - Property has an AssignmentPattern default that is non-const —
   *     a call, a member access, or a sibling-binding reference
   *     (e.g. `{ stuff = hola() }`, `{ b: y = x === 1 }`)
   *   - RestElement argument is not a plain Identifier
   * When `unsafe`, the caller MUST abort consolidation and preserve
   * the original destructure pattern verbatim.
   */
  unsafe: boolean;
}

interface SourceRange {
  start: number;
  end: number;
}

interface RawPropsTransformPlan {
  replacementParamRange?: SourceRange;
  removeRange?: SourceRange;
  replacementBaseName: string;
  restLine?: string;
  restLineInPlace?: boolean;
  fieldLocalToKey: Map<string, string>;
  fieldLocalToDefault: Map<string, string>;
  excludedRanges: SourceRange[];
}

/** Both destructured-first-param projections, computed from one parse. */
export interface DestructuredFieldInfo {
  /** local binding name → property key name (`bindValue` → `"bind:value"`). */
  readonly fieldMap: Map<string, string>;
  /** local binding name → destructure-default source text (`some` → `1+2`). */
  readonly fieldDefaults: Map<string, string>;
}

/**
 * Extract the field-key map AND the defaults map from a destructured first
 * parameter in a single session/parse. The consumers always want both (or
 * are indifferent to computing both): keeping the projections separate
 * meant two back-to-back full-extraction loops parsing every parent body
 * twice — the single largest avoidable-parse population in the session
 * churn census (see BENCHMARKS.md).
 */
export function extractDestructuredFieldInfo(body: string): DestructuredFieldInfo {
  const fieldMap = new Map<string, string>();
  const fieldDefaults = new Map<string, string>();
  const result: DestructuredFieldInfo = { fieldMap, fieldDefaults };

  const session = createFunctionTransformSession(body);
  if (!session) return result;

  const params = session.fn.params;
  if (params.length === 0) return result;

  const firstParam = params[0];
  if (firstParam.type !== 'ObjectPattern') return result;

  const bindings = collectPatternBindings(firstParam, body, session.offset);
  // Aborted destructure — return empty maps so downstream consolidation
  // (`preConsolidateRawPropsCaptures`, nested-segment field propagation)
  // skips this parent entirely instead of partially consolidating only
  // the safe-shaped fields. Matches SWC's all-or-nothing gate.
  if (bindings.unsafe) return result;

  for (const field of bindings.fields) {
    fieldMap.set(field.local, field.key);
    if (field.defaultValue !== undefined) {
      fieldDefaults.set(field.local, field.defaultValue);
    }
  }
  return result;
}

/**
 * Extract a map from local binding name to property key name from a destructured first parameter.
 * Given `({foo, "bind:value": bindValue}) => ...`, returns Map { "foo" -> "foo", "bindValue" -> "bind:value" }.
 */
export function extractDestructuredFieldMap(body: string): Map<string, string> {
  return extractDestructuredFieldInfo(body).fieldMap;
}

/**
 * Extract destructure-time default expressions from a function body whose
 * first parameter is an ObjectPattern. Returns a map keyed by local-binding
 * name to the default expression's source text (e.g. `some` → `1+2`,
 * `hey2` → `123`). Returns an empty map when the destructure aborts under
 * the safe-consolidation gate (mirrors {@link extractDestructuredFieldMap}).
 *
 * Used by nested-segment field propagation so `_rawProps.<key>` references
 * inside a child segment's body get `?? <default>` appended for fields
 * that the parent destructure defaulted — matching SWC's NullishCoalescing
 * emission in `transform_pat` (`swc-reference-only/props_destructuring.rs:382-388`).
 */
export function extractDestructuredFieldDefaultsMap(body: string): Map<string, string> {
  return extractDestructuredFieldInfo(body).fieldDefaults;
}

function collectPatternBindings(
  pattern: unknown,
  sourceText?: string,
  offset = 0,
): RawPropsBindingInfo {
  const fields: RawPropsField[] = [];
  const defaultNodes: (unknown | undefined)[] = [];
  let restElementName: string | null = null;
  let unsafe = false;

  for (const prop of getPatternProperties(pattern)) {
    if (isRestElementNode(prop)) {
      const restId = isIdentifierNode(prop.argument) ? prop.argument.name : null;
      if (restId) restElementName = restId;
      else unsafe = true;
      continue;
    }
    if (!isPropertyNode(prop)) continue;

    const keyName = getObjectPropertyKeyName(prop.key);
    if (!keyName) continue;

    // A nested ObjectPattern / ArrayPattern value (`{ stuff: { hey } }`)
    // has no `_rawProps.<key>` accessor the field-rewrite walker can emit,
    // so consolidation cannot express it — preserve the source destructure.
    if (isAstNode(prop.value)) {
      const vt = prop.value.type;
      if (vt === 'ObjectPattern' || vt === 'ArrayPattern') {
        unsafe = true;
        continue;
      }
    }

    const local = getAssignedIdentifierName(prop.value);
    if (!local) continue;

    let defaultValue: string | undefined;
    let defaultNode: unknown | undefined;
    if (isAssignmentPatternNode(prop.value)) {
      defaultNode = prop.value.right;
      if (sourceText && hasRange(prop.value.right)) {
        const defStart = prop.value.right.start - offset;
        const defEnd = prop.value.right.end - offset;
        if (defStart >= 0 && defEnd <= sourceText.length) {
          defaultValue = sourceText.slice(defStart, defEnd);
        }
      }
    }

    fields.push({ key: String(keyName), local, defaultValue });
    defaultNodes.push(defaultNode);
  }

  // Runs after the loop because it needs the full binding set; any
  // non-const default aborts the whole rewrite.
  if (!unsafe) {
    const bindingLocals = new Set<string>(fields.map((f) => f.local));
    if (restElementName) bindingLocals.add(restElementName);
    for (const node of defaultNodes) {
      if (node !== undefined && defaultExprIsNonConst(node, bindingLocals)) {
        unsafe = true;
        break;
      }
    }
  }

  return { fields, restElementName, unsafe };
}

/**
 * A destructure default is non-const — hence not inline-safe — when its
 * expression tree contains a call, a member access, or a reference to one
 * of `bindingLocals` (the sibling destructured bindings). Calls and member
 * reads are not statically relocatable; a sibling reference would dangle
 * once the destructure is eliminated. Arrow/function bodies are not
 * descended (their free references resolve at call time, not inline).
 * Object-literal property keys are not references and are skipped.
 */
function defaultExprIsNonConst(node: unknown, bindingLocals: ReadonlySet<string>): boolean {
  if (!isAstNode(node)) return false;
  const t = node.type;
  if (t === 'CallExpression') return true;
  if (t === 'MemberExpression' || t === 'StaticMemberExpression') return true;
  if (t === 'ArrowFunctionExpression' || t === 'FunctionExpression') return false;
  if (isIdentifierNode(node)) return bindingLocals.has(node.name);

  let found = false;
  forEachAstChild(node, (child, key, parent) => {
    if (found) return;
    const parentComputed = (parent as { computed?: boolean }).computed;
    const isPropertyKey =
      key === 'key' && parent.type === 'Property' && parentComputed !== true;
    if (isPropertyKey) return;
    if (defaultExprIsNonConst(child, bindingLocals)) found = true;
  });
  return found;
}

function toFieldLocalToKey(fields: RawPropsField[]): Map<string, string> {
  const fieldLocalToKey = new Map<string, string>();
  for (const field of fields) {
    fieldLocalToKey.set(field.local, field.key);
  }
  return fieldLocalToKey;
}

function toFieldLocalToDefault(fields: RawPropsField[]): Map<string, string> {
  const fieldLocalToDefault = new Map<string, string>();
  for (const field of fields) {
    if (field.defaultValue !== undefined) {
      fieldLocalToDefault.set(field.local, field.defaultValue);
    }
  }
  return fieldLocalToDefault;
}

function buildRestPropsLine(baseName: string, restElementName: string, fields: RawPropsField[]): string {
  if (fields.length === 0) {
    return `const ${restElementName} = _restProps(${baseName});`;
  }

  const excludedKeys = fields.map((field) => `"${field.key}"`).join(',\n    ');
  return `const ${restElementName} = _restProps(${baseName}, [\n    ${excludedKeys}\n]);`;
}

function getStatementRemovalRange(
  body: string,
  stmt: { start: number; end: number },
  offset: number,
): SourceRange {
  const stmtStart = stmt.start - offset;
  const stmtEnd = stmt.end - offset;
  let lineStart = stmtStart;
  while (lineStart > 0 && (body[lineStart - 1] === ' ' || body[lineStart - 1] === '\t')) {
    lineStart--;
  }

  let removeEnd = stmt.end;
  if (body.slice(stmtEnd).startsWith('\r\n')) removeEnd += 2;
  else if (body.slice(stmtEnd).startsWith('\n')) removeEnd += 1;

  return { start: offset + lineStart, end: removeEnd };
}

function isExpressionBodyArrow(body: AstMaybeNode): boolean {
  return body != null && body.type !== 'BlockStatement';
}

function blockHasTopLevelReturn(body: AstMaybeNode): boolean {
  if (body == null || body.type !== 'BlockStatement') return false;
  return (body.body ?? []).some((stmt) => stmt?.type === 'ReturnStatement');
}

function arrowBodyLooksLikeComponent(body: AstMaybeNode): boolean {
  return isExpressionBodyArrow(body) || blockHasTopLevelReturn(body);
}

function analyzeRawPropsTransform(
  session: FunctionTransformSession,
  body: string,
): RawPropsTransformPlan | null {
  const { fn, offset } = session;
  const firstParam = fn.params[0];
  if (!firstParam) return null;

  if (firstParam.type === 'Identifier') {
    return analyzeBodyDestructurePlan(firstParam.name, fn.body, body, offset);
  }

  if (firstParam.type !== 'ObjectPattern') return null;

  if (!arrowBodyLooksLikeComponent(fn.body)) return null;

  const bindings = collectPatternBindings(firstParam, body, offset);
  // SWC's `transform_pat` aborts the entire pattern rewrite when any
  // field has an unsupported shape (nested ObjectPattern/ArrayPattern,
  // call-expression default, non-ident rest argument). Preserve the
  // source destructure verbatim in that case — examples:
  //   NoWorks2: `({ count, stuff: { hey } }) => ...` (nested pattern)
  //   NoWorks3: `({ count, stuff = hola() }) => ...`  (call default)
  if (bindings.unsafe) return null;
  if (bindings.fields.length === 0 && !bindings.restElementName) return null;

  return {
    replacementParamRange: { start: firstParam.start, end: firstParam.end },
    replacementBaseName: '_rawProps',
    restLine: bindings.restElementName
      ? buildRestPropsLine('_rawProps', bindings.restElementName, bindings.fields)
      : undefined,
    fieldLocalToKey: toFieldLocalToKey(bindings.fields),
    fieldLocalToDefault: toFieldLocalToDefault(bindings.fields),
    excludedRanges: [{ start: firstParam.start, end: firstParam.end }],
  };
}

function analyzeBodyDestructurePlan(
  baseName: string,
  fnBody: FunctionTransformSession['fn']['body'],
  body: string,
  offset: number,
): RawPropsTransformPlan | null {
  if (!fnBody || fnBody.type !== 'BlockStatement') return null;

  // A destructured props object may be a local derived from the param
  // (`const props = usePlayground(rawProps)`), not the param itself; a native
  // `{ ...rest }` on it enumerates the props proxy and over-subscribes the host.
  const propsDerived = collectPropsDerivedLocals(baseName, fnBody.body ?? []);

  for (const stmt of fnBody.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || !hasRange(stmt)) continue;

    for (const declarator of stmt.declarations ?? []) {
      const plan = analyzeBodyDestructureDeclarator(propsDerived, baseName, declarator, stmt, body, offset);
      if (plan) return plan;
    }
  }

  return null;
}

function collectPropsDerivedLocals(
  baseName: string,
  statements: readonly unknown[],
): Set<string> {
  const derived = new Set<string>([baseName]);
  for (const stmt of statements) {
    if (!isAstNode(stmt) || stmt.type !== 'VariableDeclaration' || stmt.kind !== 'const') continue;
    for (const declarator of (stmt.declarations as unknown[] | undefined) ?? []) {
      if (!isVariableDeclaratorNode(declarator)) continue;
      if (!isIdentifierNode(declarator.id)) continue;
      const init = declarator.init;
      if (!isAstNode(init) || init.type !== 'CallExpression') continue;
      const arg0 = (init.arguments as unknown[] | undefined)?.[0];
      if (isIdentifierNode(arg0) && derived.has(arg0.name)) {
        derived.add(declarator.id.name);
      }
    }
  }
  return derived;
}

function analyzeBodyDestructureDeclarator(
  propsDerived: ReadonlySet<string>,
  firstParamName: string,
  declarator: unknown,
  stmt: { start: number; end: number },
  body: string,
  offset: number,
): RawPropsTransformPlan | null {
  if (!isVariableDeclaratorNode(declarator)) return null;
  if (!isAstNode(declarator.id) || declarator.id.type !== 'ObjectPattern') return null;
  if (!isIdentifierNode(declarator.init) || !propsDerived.has(declarator.init.name)) return null;
  const baseName = declarator.init.name;

  const bindings = collectPatternBindings(declarator.id, body, offset);
  // Same SWC-gate as the param-level path — preserve the source
  // destructure verbatim when any field has an unsupported shape.
  if (bindings.unsafe) return null;
  if (bindings.fields.length === 0 && !bindings.restElementName) return null;

  return {
    removeRange: getStatementRemovalRange(body, stmt, offset),
    replacementBaseName: baseName,
    restLine: bindings.restElementName
      ? buildRestPropsLine(baseName, bindings.restElementName, bindings.fields)
      : undefined,
    restLineInPlace: baseName !== firstParamName,
    fieldLocalToKey: toFieldLocalToKey(bindings.fields),
    fieldLocalToDefault: toFieldLocalToDefault(bindings.fields),
    excludedRanges: [{ start: stmt.start, end: stmt.end }],
  };
}

function isExcludedRange(
  node: { start: number; end: number },
  excludedRanges?: Array<{ start: number; end: number }>,
): boolean {
  if (!excludedRanges || excludedRanges.length === 0) return false;
  return excludedRanges.some((range) => node.start >= range.start && node.end <= range.end);
}

/**
 * Collector form for matching Identifier references to destructured
 * prop locals and emitting `IdentifierReplacement` records describing
 * where the `_rawProps.<key>` rewrite should land.
 *
 * Subtree-skip for excluded ranges (param-list, body-destructure statement)
 * runs at the orchestrator level via `skipSubtree`. The shared
 * {@link isReplaceableIdentifierPosition} predicate captures the raw-props
 * parent-context guards (property-key / non-computed member-prop / params
 * / declarator-id excluded).
 *
 * The output uses the local `IdentifierReplacement` shape rather than
 * the generic `RangeReplacement` because the apply step ({@link applyIdentifierReplacements})
 * needs the original `local` and `key` to compose the accessor + default
 * value at emit time. The collector populates a closure-captured array
 * (not the orchestrator's return value) for that reason; the orchestrator
 * is still doing the walk + skipSubtree dispatch.
 */
function buildIdentifierReplacementsCollector(
  fieldLocalToKey: ReadonlyMap<string, string>,
  offset: number,
  out: IdentifierReplacement[],
  excludedRanges?: ReadonlyArray<{ start: number; end: number }>,
): RangeReplacementCollector {
  return (node, ctx) => {
    if (hasRange(node) && isExcludedRange(node, excludedRanges as Array<{ start: number; end: number }> | undefined)) {
      return { replacements: [], skipSubtree: true };
    }
    // JSXIdentifier in a JSX tag-name position is a *reference*
    // to the same binding the regular Identifier path rewrites — `<Model/>`
    // looks up `Model` in scope just like `console.log(Model)` would. The
    // tag accepts a JSXMemberExpression, so a source-text rewrite to
    // `<props.Model/>` is valid. Only JSXOpeningElement.name and
    // JSXClosingElement.name are reference positions; JSXAttribute names,
    // JSXMemberExpression.property, and JSXNamespacedName components are
    // literal names and must NOT be rewritten.
    if (
      isAstNode(node) &&
      node.type === 'JSXIdentifier' &&
      hasRange(node) &&
      typeof (node as { name?: unknown }).name === 'string' &&
      ctx.parentKey === 'name' &&
      (ctx.parentNode?.type === 'JSXOpeningElement' ||
        ctx.parentNode?.type === 'JSXClosingElement')
    ) {
      const jsxName = (node as { name: string }).name;
      const jsxKey = fieldLocalToKey.get(jsxName);
      if (jsxKey !== undefined) {
        out.push({
          start: node.start - offset,
          end: node.end - offset,
          key: jsxKey,
          local: jsxName,
          // JSX tag position does not need parens around a MemberExpression.
          needsParens: false,
        });
      }
      return { replacements: [] };
    }
    if (!isRangedIdentifierNode(node)) return null;
    const key = fieldLocalToKey.get(node.name);
    if (key === undefined) return null;

    const isShorthandValue =
      ctx.parentKey === 'value' &&
      ctx.parentNode?.type === 'Property' &&
      ctx.parentNode.shorthand === true;

    if (isShorthandValue) {
      // Shorthand expands to `key: <accessor>` — Property-value position.
      out.push({
        start: node.start - offset,
        end: node.end - offset,
        key,
        local: node.name,
        isShorthand: true,
        needsParens: false,
      });
      return { replacements: [] };
    }
    if (isReplaceableIdentifierPosition(ctx.parentKey, ctx.parentNode)) {
      out.push({
        start: node.start - offset,
        end: node.end - offset,
        key,
        local: node.name,
        needsParens: expressionNeedsParens(ctx.parentKey, ctx.parentNode),
      });
    }
    return { replacements: [] };
  };
}

function collectIdentifierReplacements(
  root: unknown,
  fieldLocalToKey: Map<string, string>,
  offset: number,
  excludedRanges?: Array<{ start: number; end: number }>,
): IdentifierReplacement[] {
  if (!isAstNode(root)) return [];
  const out: IdentifierReplacement[] = [];
  // The shared orchestrator threads strict `AstNode` to collectors; this
  // call site has an `AstCompatNode` narrowed via `isAstNode`. The two
  // shapes share the structural fields the orchestrator + collectors
  // actually read (`type`, `start`, `end`, child node references via
  // `forEachAstChild`) so the cast is safe — same FFI-boundary
  // pragmatism as the existing `isAstNode` narrowing pattern.
  collectRangeReplacements(root as AstNode, 0, '', [
    buildIdentifierReplacementsCollector(fieldLocalToKey, offset, out, excludedRanges),
  ]);
  return out;
}

function applyIdentifierReplacements(
  session: TransformSession,
  replacements: IdentifierReplacement[],
  baseName: string,
  defaultValues?: Map<string, string>,
): void {
  for (const replacement of replacements) {
    const baseAccessor = buildPropertyAccessor(baseName, replacement.key);
    const defaultValue = defaultValues?.get(replacement.local);
    // Parens only when parent precedence requires them (captured at
    // collect time via `expressionNeedsParens` → `replacement.needsParens`).
    let accessor: string;
    if (defaultValue === undefined) {
      accessor = baseAccessor;
    } else {
      accessor = replacement.needsParens
        ? `(${baseAccessor} ?? ${defaultValue})`
        : `${baseAccessor} ?? ${defaultValue}`;
    }

    const start = session.offset + replacement.start;
    const end = session.offset + replacement.end;
    if (replacement.isShorthand) {
      session.edits.overwrite(start, end, `${replacement.key}: ${accessor}`);
    } else {
      session.edits.overwrite(start, end, accessor);
    }
  }
}

function formatConsolidatedWItems(items: string[]): string {
  if (items.length === 1) {
    return `\n        ${items[0]}\n    `;
  }
  return `\n        ${items.join(',\n        ')}\n    `;
}

function collectRawPropsWCallReplacements(session: TransformSession): Array<{
  start: number;
  end: number;
  text: string;
}> {
  const replacements: Array<{ start: number; end: number; text: string }> = [];

  function walk(node: unknown): void {
    if (!isAstNode(node)) return;

    if (isWCallWithArrayArg(node)) {
      const arg = node.arguments[0];
      const consolidated: string[] = [];
      let hasRawPropsField = false;
      let hasRawProps = false;

      for (const element of arg.elements ?? []) {
        if (!element || !hasRange(element)) continue;

        const elementText = session.wrappedSource.slice(element.start, element.end).trim();
        const isRawPropsField = isRawPropsMemberExpression(element);
        const isRawPropsIdent = isIdentifierNode(element) && element.name === '_rawProps';

        if (isRawPropsField || isRawPropsIdent) {
          if (isRawPropsField) hasRawPropsField = true;
          if (!hasRawProps) {
            consolidated.push('_rawProps');
            hasRawProps = true;
          }
        } else {
          consolidated.push(elementText);
        }
      }

      if (hasRawPropsField) {
        replacements.push({
          start: arg.start + 1,
          end: arg.end - 1,
          text: formatConsolidatedWItems(consolidated),
        });
      }
    }

    forEachAstChild(node, (child) => walk(child));
  }

  walk(session.program);
  return replacements;
}

/**
 * After _rawProps transform, consolidate .w([...]) arrays:
 * Replace any _rawProps.xxx entries with a single _rawProps, deduped.
 *
 * e.g., `.w([arg0, _rawProps.foo, _rawProps.bar])` -> `.w([arg0, _rawProps])`
 *
 * Returns the consolidated body text.
 */
export function consolidateRawPropsInWCalls(body: string): string {
  // Sound textual prefilter: a consolidation site is a `.w([...])` array
  // containing a `_rawProps` member expression (dotted OR computed —
  // `_rawProps[key]` consolidates too, so the bare token is the widest
  // sound gate). Both substrings necessarily appear in any body this pass
  // could change; most segment bodies have neither — skip the parse. This
  // was the largest per-segment one-shot parse population in the session
  // churn census (see BENCHMARKS.md).
  if (!body.includes('_rawProps') || !body.includes('.w(')) return body;
  const session = createTransformSession(body);
  if (!session) return body;

  const replacements = collectRawPropsWCallReplacements(session);
  if (replacements.length === 0) return body;

  replacements.sort((a, b) => b.start - a.start);
  for (const replacement of replacements) {
    session.edits.overwrite(replacement.start, replacement.end, replacement.text);
  }
  return session.toSource();
}

export function applyRawPropsTransform(body: string): string {
  const session = createFunctionTransformSession(body);
  if (!session) return body;

  const plan = analyzeRawPropsTransform(session, body);
  if (!plan) return body;

  if (plan.replacementParamRange) {
    session.edits.overwrite(plan.replacementParamRange.start, plan.replacementParamRange.end, '_rawProps');
  }
  if (plan.removeRange) {
    // A props-derived local declared mid-body would hit a TDZ if the rest line
    // were inserted at the prologue, so emit it in place of the destructure.
    if (plan.restLine && plan.restLineInPlace) {
      session.edits.overwrite(plan.removeRange.start, plan.removeRange.end, plan.restLine);
    } else {
      session.edits.remove(plan.removeRange.start, plan.removeRange.end);
      if (plan.restLine) insertFunctionBodyPrologue(session, session.fn, plan.restLine);
    }
  } else if (plan.restLine) {
    insertFunctionBodyPrologue(session, session.fn, plan.restLine);
  }
  if (plan.fieldLocalToKey.size > 0) {
    const replacements = collectIdentifierReplacements(
      session.program,
      plan.fieldLocalToKey,
      session.offset,
      plan.excludedRanges,
    );
    applyIdentifierReplacements(
      session,
      replacements,
      plan.replacementBaseName,
      plan.fieldLocalToDefault,
    );
  }

  return session.toSource();
}

export function bodyConsolidatesToRawProps(body: string): boolean {
  const session = createFunctionTransformSession(body);
  if (!session) return false;
  return analyzeRawPropsTransform(session, body)?.replacementParamRange !== undefined;
}

export function consolidateQpCaptureValues(
  params: readonly string[],
  fieldMap: ReadonlyMap<string, string>,
): string[] {
  return params.map((p) => {
    const key = fieldMap.get(p);
    return key === undefined ? p : `_rawProps.${key}`;
  });
}

/**
 * Replace original field name references with _rawProps.field in a body string.
 * For child segments whose captures were consolidated into a single _rawProps capture.
 *
 * When `defaultValues` is provided, defaulted fields emit
 * `(_rawProps.<key> ?? <default>)`.
 */
export function replacePropsFieldReferencesInBody(
  body: string,
  fieldMap: Map<string, string>,
  defaultValues?: ReadonlyMap<string, string>,
): string {
  return rewritePropsFieldReferences(body, fieldMap, {
    memberPropertyMode: 'nonComputed',
    defaultValues,
  });
}
