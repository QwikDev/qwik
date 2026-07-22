/**
 * Raw props transformation for component$ extractions: rewrites destructured
 * parameters to `(_rawProps) => ... _rawProps.<field> ...`.
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
 * Options for JSX transpilation within inline .s() body text. `source` is
 * required only when `devOptions` is set — used to compute source-relative
 * dev-info positions.
 */
export interface InlineSegmentJsxOptions {
  enableJsx: boolean;
  importedNames: Set<string>;
  devOptions?: DevSuffixOptions;
  source?: string;
  keyCounterStart?: number;
  relPath?: string;
}

interface IdentifierReplacement {
  start: number;
  end: number;
  key: string;
  local: string;
  isShorthand?: boolean;
  needsParens?: boolean;
}

interface RawPropsField {
  key: string;
  local: string;
  defaultValue?: string;
}

/**
 * `unsafe` is true when the destructure has a shape consolidation cannot express
 * (nested pattern, non-const default, or non-identifier rest); the caller must
 * then abort and preserve the source destructure verbatim.
 */
interface RawPropsBindingInfo {
  fields: RawPropsField[];
  restElementName: string | null;
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
 * Extract the field-key map and the defaults map from a destructured first
 * parameter in a single parse.
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
  // Aborted destructure — return empty maps so downstream consolidation skips
  // this parent entirely rather than partially consolidating safe fields only.
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
 * Extract destructure-time default expressions from a function whose first
 * parameter is an ObjectPattern (e.g. `some` → `1+2`). Empty map when the
 * destructure aborts under the safe-consolidation gate.
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

    // A nested pattern value (`{ stuff: { hey } }`) has no `_rawProps.<key>`
    // accessor to emit, so consolidation cannot express it — abort.
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

  // After the loop: needs the full binding set; any non-const default aborts.
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
 * A destructure default is non-const — not inline-safe — when its expression
 * contains a call, a member access, or a sibling-binding reference (which would
 * dangle once the destructure is eliminated). Arrow/function bodies aren't
 * descended; object-literal keys aren't references.
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
  // Abort the whole pattern rewrite when any field has an unsupported shape
  // (nested pattern, call-expression default, non-ident rest) — preserve the
  // source destructure verbatim.
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

  // The destructured props object may be a local derived from the param
  // (`const props = usePlayground(rawProps)`); `{ ...rest }` on it would
  // enumerate the props proxy and over-subscribe.
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
  // Same gate as the param-level path — preserve the source destructure when
  // any field has an unsupported shape.
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
 * Collector matching Identifier references to destructured prop locals, emitting
 * `IdentifierReplacement` records for the `_rawProps.<key>` rewrite. Uses the
 * local shape (not generic `RangeReplacement`) because the apply step needs the
 * original `local`/`key` to compose the accessor + default at emit time.
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
    // A JSXIdentifier in tag-name position is a reference to the same binding
    // (`<Model/>` resolves `Model` in scope), so rewrite to `<props.Model/>`.
    // Only opening/closing tag names are references — attribute names,
    // member-expression properties, and namespace parts must NOT be rewritten.
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
  // `root` is an `AstCompatNode` narrowed via `isAstNode`; it shares the
  // structural fields the orchestrator reads, so the cast to `AstNode` is safe.
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
    // Parens only when parent precedence requires them (via `replacement.needsParens`).
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
 * Consolidate `.w([...])` arrays after the _rawProps transform: any `_rawProps.x`
 * entries collapse to a single deduped `_rawProps`.
 * e.g. `.w([arg0, _rawProps.foo, _rawProps.bar])` → `.w([arg0, _rawProps])`
 */
export function consolidateRawPropsInWCalls(body: string): string {
  // Textual prefilter: any body this pass could change contains both `_rawProps`
  // and `.w(`; most have neither, so skip the parse.
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
 * Replace field-name references with `_rawProps.<field>` in a body string, for
 * child segments whose captures were consolidated into a single `_rawProps`.
 * With `defaultValues`, defaulted fields emit `(_rawProps.<key> ?? <default>)`.
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
