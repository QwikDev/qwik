/**
 * JSX children processing for the Qwik optimizer.
 *
 * Handles normalization of JSXText whitespace, classification of child
 * node types (static/dynamic), and signal analysis for child expressions.
 */

import { createRegExp, exactly, oneOrMore, anyOf, digit, whitespace, charNotIn } from 'magic-regexp';
import { analyzeSignalExpression } from '../signal-analysis.js';
import {
  classifyConstness,
  type JsxTransformContext,
  type ProcessChildrenOptions,
} from './jsx.js';
import type { JSXChild, JSXElement, JSXExpressionContainer, JSXFragment } from '../../ast-types.js';

type AnnotatedJSXChild = JSXChild & { _trimmedText?: string };

const jsxFlagTail = createRegExp(
  exactly(',').and(whitespace.times.any()).and(oneOrMore(digit).grouped())
    .and(',').and(whitespace.times.any())
    .and(anyOf(exactly('"').and(charNotIn('"').times.any()).and('"'), exactly('null')))
    .and(whitespace.times.any()).and(')').at.lineEnd(),
);

const jsxSortedVarProps = createRegExp(
  exactly('_jsxSorted(').and(oneOrMore(charNotIn(','))).and(',').and(whitespace.times.any())
    .and(anyOf('{', 'null').grouped()),
);

/**
 * Normalize JSXText nodes following standard JSX whitespace rules.
 * Returns only meaningful children (non-empty text and non-text nodes).
 */
export function normalizeJsxChildren(children: JSXChild[]): (JSXChild & { _trimmedText?: string })[] {
  const meaningful: (JSXChild & { _trimmedText?: string })[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.type !== 'JSXText') {
      meaningful.push(child);
      continue;
    }

    const raw = child.value ?? '';
    const hasNewline = raw.includes('\n');
    let normalized: string;

    if (hasNewline) {
      // Babel/React JSX whitespace rule (`cleanJSXElementLiteralChild` in
      // @babel/plugin-transform-react-jsx). The key asymmetry the naive
      // `lines.map(trim).filter().join(' ')` form gets wrong: a line that
      // is BOTH the last line of the chunk AND non-empty preserves its
      // trailing whitespace, because the trailing space belongs to inline
      // content rather than a newline-adjacent indent. Same for the first
      // line and its leading whitespace.
      //
      // Worked examples:
      //   "\n    Level "   → "Level "   (trailing space kept; it's on the
      //                                   last non-empty line)
      //   "\n    B\n    "  → "B"        (trailing whitespace is on a
      //                                   later, empty line — dropped)
      const lines = raw.split('\n');
      let lastNonEmptyLine = -1;
      for (let li = 0; li < lines.length; li++) {
        if (/[^ \t]/.test(lines[li])) lastNonEmptyLine = li;
      }
      let out = '';
      for (let li = 0; li < lines.length; li++) {
        let line = lines[li].replace(/\t/g, ' ');
        const isFirstLine = li === 0;
        const isLastLine = li === lines.length - 1;
        const isLastNonEmptyLine = li === lastNonEmptyLine;
        if (!isFirstLine) line = line.replace(/^ +/, '');
        if (!isLastLine) line = line.replace(/ +$/, '');
        if (line) {
          if (!isLastNonEmptyLine) line += ' ';
          out += line;
        }
      }
      normalized = out;
    } else {
      const prevChild = i > 0 ? children[i - 1] : null;
      if (prevChild && prevChild.type === 'JSXExpressionContainer') {
        normalized = raw;
      } else {
        normalized = raw.replace(/^\s+/, '');
      }
      const nextNonWhitespace = children.slice(i + 1).find(
        (c: JSXChild) => c.type !== 'JSXText' || (c.type === 'JSXText' && c.value?.trim()),
      );
      if (!nextNonWhitespace) {
        normalized = normalized.trimEnd();
      }
    }

    if (normalized) {
      meaningful.push({ ...child, _trimmedText: normalized });
      continue;
    }

    if (!hasNewline) {
      const prevSibling = meaningful.length > 0 ? meaningful[meaningful.length - 1] : null;
      const nextSibling = children.slice(i + 1).find(
        (c: JSXChild) => c.type !== 'JSXText' || c.value.trim(),
      );
      if (
        prevSibling && nextSibling &&
        prevSibling.type === 'JSXExpressionContainer' &&
        nextSibling.type === 'JSXExpressionContainer'
      ) {
        meaningful.push({ ...child, _trimmedText: ' ' });
      }
    }
  }

  return meaningful;
}

/**
 * Process JSX children nodes and return a children string representation.
 */
export function processChildren(
  ctx: JsxTransformContext,
  children: JSXChild[],
  opts: ProcessChildrenOptions,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (!children || children.length === 0) {
    return { text: null, type: 'none' };
  }

  const meaningful = normalizeJsxChildren(children);

  if (meaningful.length === 0) {
    return { text: null, type: 'none' };
  }

  if (meaningful.length === 1) {
    return processOneChild(ctx, meaningful[0], opts);
  }

  const parts: string[] = [];
  let isDynamic = false;
  for (const child of meaningful) {
    const { text, type } = processOneChild(ctx, child, opts);
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
 * Check if a transformed JSX call's flag indicates a dynamic subtree.
 * Parses the trailing ", N, key)" pattern from _jsxSorted output.
 */
function hasStaticSubtreeFlag(transformedText: string): boolean {
  const flagMatch = transformedText.match(jsxFlagTail);
  if (!flagMatch) return true;
  const flag = parseInt(flagMatch[1]!, 10);
  return (flag & 2) !== 0;
}

/**
 * Classify a nested JSX element/fragment child as static or dynamic.
 * SWC propagates dynamic status upward through the JSX tree.
 */
function classifyNestedJsxChild(
  child: JSXElement | JSXFragment,
  childText: string,
): 'static' | 'dynamic' {
  if (child.type === 'JSXFragment') {
    return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
  }

  const tagName = child.openingElement.name;
  const tagStr = tagName.type === 'JSXIdentifier' ? tagName.name : '';
  const isComponent = tagStr.length > 0 && tagStr[0] === tagStr[0].toUpperCase() && tagStr[0] !== tagStr[0].toLowerCase();
  if (isComponent) return 'dynamic';

  const varPropsMatch = childText.match(jsxSortedVarProps);
  if (varPropsMatch && varPropsMatch[1] === '{') return 'dynamic';

  return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
}

function processOneChild(
  ctx: JsxTransformContext,
  child: AnnotatedJSXChild,
  opts: ProcessChildrenOptions,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (child._trimmedText) {
    return { text: `"${child._trimmedText}"`, type: 'static' };
  }

  if (child.type === 'JSXText') {
    const trimmed = child.value.trim();
    if (!trimmed) return { text: null, type: 'none' };
    return { text: `"${trimmed}"`, type: 'static' };
  }

  if (child.type === 'JSXExpressionContainer') {
    return processExpressionChild(ctx, child, opts);
  }

  if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
    const childText = ctx.s.slice(child.start, child.end);
    const type = classifyNestedJsxChild(child, childText);
    return { text: childText, type };
  }

  return { text: null, type: 'none' };
}

/** Process a JSX expression container child ({expr}). */
function processExpressionChild(
  ctx: JsxTransformContext,
  child: JSXExpressionContainer,
  opts: ProcessChildrenOptions,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  const expr = child.expression;
  if (!expr || expr.type === 'JSXEmptyExpression') {
    return { text: null, type: 'none' };
  }

  const { source, s, importedNames, signalHoister, constIdents, allDeclaredNames } = ctx;
  const { neededImports, enableSignalAnalysis = true } = opts;
  const exprText = s.slice(expr.start, expr.end);

  // Runtime emits all four literal interfaces (String/Numeric/Boolean/Null)
  // under one `'Literal'` discriminant; narrow on `.value`'s primitive type.
  if (
    expr.type === 'Literal' &&
    (typeof expr.value === 'string' ||
      typeof expr.value === 'number' ||
      typeof expr.value === 'boolean')
  ) {
    return { text: exprText, type: 'static' };
  }

  // The signal-analysis branch and the constness-classification branch
  // were historically gated on `importedNames` being defined — the call
  // site in `transformJsxElement` passed `undefined` for both
  // `importedNames` and `signalHoister` whenever `childSignalsEnabled`
  // was false (text-only tags, components opting out). Now expressed as
  // a single typed `enableSignalAnalysis` opt; both branches share the
  // gate because they were always toggled together at the call site.
  if (!enableSignalAnalysis) {
    return { text: exprText, type: 'dynamic' };
  }

  const signalResult = analyzeSignalExpression(expr, source, importedNames, allDeclaredNames);

  if (signalResult.type === 'wrapProp') {
    neededImports.add('_wrapProp');
    let wrapIsConst = true;
    if (expr.type === 'MemberExpression' && expr.object?.type === 'Identifier') {
      const objName = expr.object.name;
      if (!importedNames.has(objName) && !(constIdents?.has(objName))) {
        wrapIsConst = false;
      }
    }
    return { text: signalResult.code, type: wrapIsConst ? 'static' : 'dynamic' };
  }

  if (signalResult.type === 'fnSignal') {
    const hfName = signalHoister.hoist(signalResult.hoistedFn, signalResult.hoistedStr, expr.start ?? 0);
    const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
    neededImports.add('_fnSignal');
    const depsConst = signalResult.deps.every(dep =>
      importedNames.has(dep) || (constIdents?.has(dep) ?? false)
    );
    return { text: fnSignalCall, type: depsConst ? 'static' : 'dynamic' };
  }

  const propClass = classifyConstness(expr, importedNames, constIdents);
  if (propClass === 'const') {
    return { text: exprText, type: 'static' };
  }

  return { text: exprText, type: 'dynamic' };
}
