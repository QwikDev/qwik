import { analyzeSignalExpression } from './signal-analysis.js';
import {
  classifyConstness,
  sliceTransformed,
  type JsxTransformContext,
  type ProcessChildrenOptions,
} from './jsx.js';
import type { JSXChild, JSXElement, JSXExpressionContainer, JSXFragment } from '../../ast-types.js';

type AnnotatedJSXChild = JSXChild & { _trimmedText?: string };

export function normalizeJsxChildren(
  children: JSXChild[]
): (JSXChild & { _trimmedText?: string })[] {
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
      // JSX whitespace normalization (Babel's `cleanJSXElementLiteralChild`):
      // a line that is both the last line of the chunk and non-empty keeps its
      // trailing whitespace, and a first line keeps its leading whitespace —
      // only newline-adjacent indentation is stripped.
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
      // Same-line whitespace after a sibling element/expression is significant
      // (`<C/> <C/>` keeps the space); only leading text of the parent trims.
      if (
        prevChild &&
        (prevChild.type === 'JSXExpressionContainer' ||
          prevChild.type === 'JSXElement' ||
          prevChild.type === 'JSXFragment')
      ) {
        normalized = raw;
      } else {
        normalized = raw.replace(/^\s+/, '');
      }
      const nextNonWhitespace = children
        .slice(i + 1)
        .find((c: JSXChild) => c.type !== 'JSXText' || (c.type === 'JSXText' && c.value?.trim()));
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
      const nextSibling = children
        .slice(i + 1)
        .find((c: JSXChild) => c.type !== 'JSXText' || c.value.trim());
      if (
        prevSibling &&
        nextSibling &&
        prevSibling.type === 'JSXExpressionContainer' &&
        nextSibling.type === 'JSXExpressionContainer'
      ) {
        meaningful.push({ ...child, _trimmedText: ' ' });
      }
    }
  }

  return meaningful;
}

export function processChildren(
  ctx: JsxTransformContext,
  children: JSXChild[],
  opts: ProcessChildrenOptions
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
 * Structural mirror of rust's `jsx_mutable`: component and member-expression tags re-render on
 * their own, var props and a dynamic subtree propagate up. The child's facts come from the write
 * memo recorded by its own transform (the walk is bottom-up), never from re-parsing generated
 * code.
 */
function classifyNestedJsxChild(
  ctx: JsxTransformContext,
  child: JSXElement | JSXFragment
): 'static' | 'dynamic' {
  if (child.type === 'JSXElement') {
    const tagName = child.openingElement.name;
    if (tagName.type === 'JSXMemberExpression') return 'dynamic';
    const tagStr = tagName.type === 'JSXIdentifier' ? tagName.name : '';
    const isComponent =
      tagStr.length > 0 &&
      tagStr[0] === tagStr[0].toUpperCase() &&
      tagStr[0] !== tagStr[0].toLowerCase();
    if (isComponent) return 'dynamic';
  }

  const written = ctx.jsxWriteMemo?.get(child.start);
  // Unknown ⇒ mutable: a misclassified-static child stops updating.
  if (!written || written.end !== child.end) return 'dynamic';
  if (written.hasVarProps) return 'dynamic';
  return (written.flags & 2) !== 0 ? 'static' : 'dynamic';
}

function processOneChild(
  ctx: JsxTransformContext,
  child: AnnotatedJSXChild,
  opts: ProcessChildrenOptions
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  if (child._trimmedText) {
    return { text: JSON.stringify(child._trimmedText), type: 'static' };
  }

  if (child.type === 'JSXText') {
    const trimmed = child.value.trim();
    if (!trimmed) return { text: null, type: 'none' };
    return { text: JSON.stringify(trimmed), type: 'static' };
  }

  if (child.type === 'JSXExpressionContainer') {
    return processExpressionChild(ctx, child, opts);
  }

  if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
    const childText = sliceTransformed(ctx, child.start, child.end);
    const type = classifyNestedJsxChild(ctx, child);
    return { text: childText, type };
  }

  return { text: null, type: 'none' };
}

function processExpressionChild(
  ctx: JsxTransformContext,
  child: JSXExpressionContainer,
  opts: ProcessChildrenOptions
): { text: string | null; type: 'none' | 'static' | 'dynamic' } {
  const expr = child.expression;
  if (!expr || expr.type === 'JSXEmptyExpression') {
    return { text: null, type: 'none' };
  }

  const { source, importedNames, signalHoister, bindings, allDeclaredNames } = ctx;
  const { neededImports, enableSignalAnalysis = true } = opts;
  const exprText = sliceTransformed(ctx, expr.start, expr.end);

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

  // Without signal analysis, staticness can't be proven — classify dynamic.
  if (!enableSignalAnalysis) {
    return { text: exprText, type: 'dynamic' };
  }

  const signalResult = analyzeSignalExpression(expr, source, importedNames, allDeclaredNames);

  if (signalResult.type === 'wrapProp') {
    neededImports.add('_wrapProp');
    let wrapIsConst = true;
    if (expr.type === 'MemberExpression' && expr.object?.type === 'Identifier') {
      const objName = expr.object.name;
      if (!importedNames.has(objName) && bindings?.classify(objName, expr.start) !== 'const') {
        wrapIsConst = false;
      }
    }
    return { text: signalResult.code, type: wrapIsConst ? 'static' : 'dynamic' };
  }

  if (signalResult.type === 'fnSignal') {
    const depsConst = signalResult.deps.every(
      (dep) => importedNames.has(dep) || bindings?.classify(dep, expr.start) === 'const'
    );
    // Rust never wraps a non-const template literal or call: re-evaluating
    // one may repeat side effects it contains (transform.rs).
    if (depsConst || (expr.type !== 'TemplateLiteral' && expr.type !== 'CallExpression')) {
      const hfName = signalHoister.hoist(
        signalResult.hoistedFn,
        signalResult.hoistedStr,
        expr.start ?? 0
      );
      const fnSignalCall = `_fnSignal(${hfName}, [${signalResult.deps.join(', ')}], ${hfName}_str)`;
      neededImports.add('_fnSignal');
      return { text: fnSignalCall, type: depsConst ? 'static' : 'dynamic' };
    }
  }

  const propClass = classifyConstness(expr, importedNames, bindings, expr.start);
  if (propClass === 'const') {
    return { text: exprText, type: 'static' };
  }

  return { text: exprText, type: 'dynamic' };
}
