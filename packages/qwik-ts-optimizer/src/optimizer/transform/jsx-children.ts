/**
 * JSX children processing for the Qwik optimizer.
 *
 * Handles normalization of JSXText whitespace, classification of child
 * node types (static/dynamic), and signal analysis for child expressions.
 */

import { createRegExp, exactly, oneOrMore, anyOf, digit, whitespace, charNotIn } from 'magic-regexp';
import { analyzeSignalExpression, type SignalHoister } from '../signal-analysis.js';
import { classifyProp } from './jsx.js';
import type { JSXChild } from '../../ast-types.js';

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
      const lines = raw.split('\n');
      const trimmedLines = lines.map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      normalized = trimmedLines.join(' ');
    } else {
      // Preserve leading whitespace after expression containers
      const prevChild = i > 0 ? children[i - 1] : null;
      if (prevChild && prevChild.type === 'JSXExpressionContainer') {
        normalized = raw;
      } else {
        normalized = raw.replace(/^\s+/, '');
      }
      // Trim trailing if this is the last meaningful child
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

    // Whitespace-only text: preserve as " " only when between two expression
    // containers on the same line. Multi-line whitespace is stripped.
    if (!hasNewline) {
      const prevSibling = meaningful.length > 0 ? meaningful[meaningful.length - 1] : null;
      const nextSibling = children.slice(i + 1).find(
        (c: any) => c.type !== 'JSXText' || c.value?.trim(),
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
  children: JSXChild[],
  source: string,
  s?: import('magic-string').default,
  importedNames?: Set<string>,
  signalHoister?: SignalHoister,
  neededImports?: Set<string>,
  constIdents?: Set<string>,
  allDeclaredNames?: Set<string>,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (!children || children.length === 0) {
    return { text: null, type: 'none' };
  }

  const meaningful = normalizeJsxChildren(children);

  if (meaningful.length === 0) {
    return { text: null, type: 'none' };
  }

  if (meaningful.length === 1) {
    return processOneChild(meaningful[0], source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
  }

  const parts: string[] = [];
  let isDynamic = false;
  for (const child of meaningful) {
    const { text, type } = processOneChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
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
  child: any,
  childText: string,
): 'static' | 'dynamic' {
  if (child.type === 'JSXFragment') {
    return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
  }

  // Component tags (uppercase) are always dynamic
  const tagName = child.openingElement?.name;
  const tagStr = tagName?.type === 'JSXIdentifier' ? tagName.name : '';
  const isComponent = tagStr.length > 0 && tagStr[0] === tagStr[0].toUpperCase() && tagStr[0] !== tagStr[0].toLowerCase();
  if (isComponent) return 'dynamic';

  // HTML elements: dynamic if they have varProps or a dynamic subtree flag
  const varPropsMatch = childText.match(jsxSortedVarProps);
  if (varPropsMatch && varPropsMatch[1] === '{') return 'dynamic';

  return hasStaticSubtreeFlag(childText) ? 'static' : 'dynamic';
}

function processOneChild(
  child: any,
  source: string,
  s?: import('magic-string').default,
  importedNames?: Set<string>,
  signalHoister?: SignalHoister,
  neededImports?: Set<string>,
  constIdents?: Set<string>,
  allDeclaredNames?: Set<string>,
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
    return processExpressionChild(child, source, s, importedNames, signalHoister, neededImports, constIdents, allDeclaredNames);
  }

  if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
    const childText = s ? s.slice(child.start, child.end) : source.slice(child.start, child.end);
    const type = classifyNestedJsxChild(child, childText);
    return { text: childText, type };
  }

  return { text: null, type: 'none' };
}

/** Process a JSX expression container child ({expr}). */
function processExpressionChild(
  child: any,
  source: string,
  s?: import('magic-string').default,
  importedNames?: Set<string>,
  signalHoister?: SignalHoister,
  neededImports?: Set<string>,
  constIdents?: Set<string>,
  allDeclaredNames?: Set<string>,
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  const expr = child.expression;
  if (!expr || expr.type === 'JSXEmptyExpression') {
    return { text: null, type: 'none' };
  }

  const exprText = s ? s.slice(expr.start, expr.end) : source.slice(expr.start, expr.end);

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

  if (importedNames && signalHoister) {
    const signalResult = analyzeSignalExpression(expr, source, importedNames, allDeclaredNames);

    if (signalResult.type === 'wrapProp') {
      neededImports?.add('_wrapProp');
      // _wrapProp children are static only when the signal/store target is const-bound
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
      neededImports?.add('_fnSignal');
      const depsConst = signalResult.deps.every(dep =>
        importedNames.has(dep) || (constIdents?.has(dep) ?? false)
      );
      return { text: fnSignalCall, type: depsConst ? 'static' : 'dynamic' };
    }
  }

  if (importedNames) {
    const propClass = classifyProp(expr, importedNames, constIdents);
    if (propClass === 'const') {
      return { text: exprText, type: 'static' };
    }
  }

  return { text: exprText, type: 'dynamic' };
}
