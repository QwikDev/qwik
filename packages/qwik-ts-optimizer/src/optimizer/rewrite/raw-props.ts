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
} from '../../ast-types.js';
import { buildPropertyAccessor } from '../utils/identifier-name.js';
import { rewritePropsFieldReferences } from '../utils/props-field-rewrite.js';
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
} from '../utils/ast.js';
import {
  createFunctionTransformSession,
  createTransformSession,
  insertFunctionBodyPrologue,
  type FunctionTransformSession,
  type TransformSession,
} from '../utils/transform-session.js';

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
export interface SCallBodyJsxOptions {
  /** Whether to apply JSX transpilation */
  enableJsx: boolean;
  /** Set of imported identifier names (for prop classification) */
  importedNames: Set<string>;
  /** Dev mode options for JSX source info */
  devOptions?: { relPath: string };
  /** Starting key counter value (for continuation from module-level JSX) */
  keyCounterStart?: number;
  /** Relative file path for key prefix derivation */
  relPath?: string;
}

/**
 * Rewrite ({field1, field2}) => ... to (_rawProps) => ... _rawProps.field1 ...
 * so signal analysis detects store field accesses.
 */
export interface RawPropsTransformResult {
  /** The transformed body text */
  body: string;
  /** Whether any transformation was applied */
  transformed: boolean;
  /** The destructured field local names that were replaced with _rawProps.field */
  destructuredFieldLocals: string[];
}

interface IdentifierReplacement {
  start: number;
  end: number;
  key: string;
  local: string;
  isShorthand?: boolean;
}

interface RawPropsField {
  key: string;
  local: string;
  defaultValue?: string;
}

interface RawPropsBindingInfo {
  fields: RawPropsField[];
  restElementName: string | null;
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
  fieldLocalToKey: Map<string, string>;
  fieldLocalToDefault: Map<string, string>;
  excludedRanges: SourceRange[];
}

export function applyRawPropsTransformDetailed(body: string): RawPropsTransformResult {
  const result = applyRawPropsTransform(body);
  if (result === body) {
    return { body, transformed: false, destructuredFieldLocals: [] };
  }
  // Extract the field names by re-parsing the original body
  const fieldLocals = [...extractDestructuredFieldMap(body).keys()];
  return { body: result, transformed: true, destructuredFieldLocals: fieldLocals };
}

/**
 * Extract a map from local binding name to property key name from a destructured first parameter.
 * Given `({foo, "bind:value": bindValue}) => ...`, returns Map { "foo" -> "foo", "bindValue" -> "bind:value" }.
 */
export function extractDestructuredFieldMap(body: string): Map<string, string> {
  const session = createFunctionTransformSession('__rpx__.tsx', body, {
    wrapperPrefix: 'const __rp__ = ',
  });
  if (!session) return new Map();

  const params = session.fn.params;
  if (params.length === 0) return new Map();

  const firstParam = params[0];
  if (firstParam.type !== 'ObjectPattern') return new Map();

  const fieldMap = new Map<string, string>();
  for (const field of collectPatternBindings(firstParam).fields) {
    fieldMap.set(field.local, field.key);
  }
  return fieldMap;
}

function collectPatternBindings(
  pattern: unknown,
  sourceText?: string,
  offset = 0,
): RawPropsBindingInfo {
  const fields: RawPropsField[] = [];
  let restElementName: string | null = null;

  for (const prop of getPatternProperties(pattern)) {
    if (isRestElementNode(prop)) {
      const restId = isIdentifierNode(prop.argument) ? prop.argument.name : null;
      if (restId) restElementName = restId;
      continue;
    }
    if (!isPropertyNode(prop)) continue;

    const keyName = getObjectPropertyKeyName(prop.key);
    const local = getAssignedIdentifierName(prop.value);
    if (!keyName || !local) continue;

    let defaultValue: string | undefined;
    if (
      sourceText &&
      isAssignmentPatternNode(prop.value) &&
      hasRange(prop.value.right)
    ) {
      const defStart = prop.value.right.start - offset;
      const defEnd = prop.value.right.end - offset;
      if (defStart >= 0 && defEnd <= sourceText.length) {
        defaultValue = sourceText.slice(defStart, defEnd);
      }
    }

    fields.push({ key: String(keyName), local, defaultValue });
  }

  return { fields, restElementName };
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

  const bindings = collectPatternBindings(firstParam, body, offset);
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

  for (const stmt of fnBody.body ?? []) {
    if (stmt.type !== 'VariableDeclaration' || !hasRange(stmt)) continue;

    for (const declarator of stmt.declarations ?? []) {
      const plan = analyzeBodyDestructureDeclarator(baseName, declarator, stmt, body, offset);
      if (plan) return plan;
    }
  }

  return null;
}

function analyzeBodyDestructureDeclarator(
  baseName: string,
  declarator: unknown,
  stmt: { start: number; end: number },
  body: string,
  offset: number,
): RawPropsTransformPlan | null {
  if (!isVariableDeclaratorNode(declarator)) return null;
  if (!isAstNode(declarator.id) || declarator.id.type !== 'ObjectPattern') return null;
  if (!isIdentifierNode(declarator.init) || declarator.init.name !== baseName) return null;

  const bindings = collectPatternBindings(declarator.id);
  if (bindings.fields.length === 0 && !bindings.restElementName) return null;

  return {
    removeRange: getStatementRemovalRange(body, stmt, offset),
    replacementBaseName: baseName,
    restLine: bindings.restElementName
      ? buildRestPropsLine(baseName, bindings.restElementName, bindings.fields)
      : undefined,
    fieldLocalToKey: toFieldLocalToKey(bindings.fields),
    fieldLocalToDefault: new Map(),
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

function collectIdentifierReplacements(
  root: unknown,
  fieldLocalToKey: Map<string, string>,
  offset: number,
  excludedRanges?: Array<{ start: number; end: number }>,
): IdentifierReplacement[] {
  const replacements: IdentifierReplacement[] = [];

  function walk(node: unknown, parentKey?: string, parentNode?: AstCompatNode): void {
    if (!isAstNode(node)) return;
    if (
      hasRange(node) &&
      isExcludedRange(node, excludedRanges)
    ) {
      return;
    }

    if (isRangedIdentifierNode(node) && fieldLocalToKey.has(node.name)) {
      const isPropertyKey =
        parentKey === 'key' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty');
      const isMemberProp =
        parentKey === 'property' &&
        (parentNode?.type === 'MemberExpression' ||
          parentNode?.type === 'StaticMemberExpression') &&
        !parentNode?.computed;
      const isParam = parentKey === 'params';
      const isDeclaratorId = parentKey === 'id' && parentNode?.type === 'VariableDeclarator';
      const isShorthandValue =
        parentKey === 'value' &&
        (parentNode?.type === 'Property' || parentNode?.type === 'ObjectProperty') &&
        parentNode?.shorthand === true;

      if (isShorthandValue) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
          local: node.name,
          isShorthand: true,
        });
      } else if (!isPropertyKey && !isMemberProp && !isParam && !isDeclaratorId) {
        replacements.push({
          start: node.start - offset,
          end: node.end - offset,
          key: fieldLocalToKey.get(node.name)!,
          local: node.name,
        });
      }
    }

    forEachAstChild(node, (child, key, parent) => walk(child, key, parent));
  }

  walk(root);
  return replacements;
}

function applyIdentifierReplacements(
  session: TransformSession,
  replacements: IdentifierReplacement[],
  baseName: string,
  defaultValues?: Map<string, string>,
): void {
  for (const replacement of replacements) {
    let accessor = buildPropertyAccessor(baseName, replacement.key);
    const defaultValue = defaultValues?.get(replacement.local);
    if (defaultValue !== undefined) {
      accessor = `(${accessor} ?? ${defaultValue})`;
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
  const session = createTransformSession('__rpw__.tsx', body, {
    wrapperPrefix: 'const __rpw__ = ',
  });
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
  const session = createFunctionTransformSession('__rp__.tsx', body, {
    wrapperPrefix: 'const __rp__ = ',
  });
  if (!session) return body;

  const plan = analyzeRawPropsTransform(session, body);
  if (!plan) return body;

  if (plan.replacementParamRange) {
    session.edits.overwrite(plan.replacementParamRange.start, plan.replacementParamRange.end, '_rawProps');
  }
  if (plan.removeRange) {
    session.edits.remove(plan.removeRange.start, plan.removeRange.end);
  }
  if (plan.restLine) {
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

/**
 * Replace original field name references with _rawProps.field in a body string.
 * For child segments whose captures were consolidated into a single _rawProps capture.
 */
export function replacePropsFieldReferencesInBody(body: string, fieldMap: Map<string, string>): string {
  return rewritePropsFieldReferences(body, fieldMap, {
    parseFilename: '__rpfb__.tsx',
    wrapperPrefix: 'const __rpfb__ = ',
    memberPropertyMode: 'nonComputed',
  });
}
