/** Children and render expressions: flattening, text merging, branches. */
import type { Expression, JSXChild } from 'oxc-parser';
import {
  Shape,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  QrlPayloadKind,
  SeedKind,
  type Op,
} from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import { RAW_TEXT_ELEMENTS, RCDATA_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { lowerText } from './lower-text';
import { lowerBranch, type BranchArm } from './lower-branch';
import { unwrapExpression } from './ast/utils';
import { JsxValueKind, type JsxValue } from './ast/jsx-analysis';
import { lowerComputedExpressionValue, lowerTemplateValue } from './lower-expr';
import type { LowerContext } from './lower-context';
import { lowerArray } from './lower-array';
import { QwikDirective } from '../words';
import { lowerJsx } from './lower-jsx';
import { findDirective } from './lower-projection';
/**
 * Content the parser reads as one text node. Raw text is a literal, since a live value belongs to
 * `dangerouslySetInnerHTML`; RCDATA with several parts is one hole, as a marker would show as
 * text.
 */
export function lowerContentChildren(
  tag: string,
  children: readonly JSXChild[],
  ctx: LowerContext
): Op[] {
  const isRawText = RAW_TEXT_ELEMENTS.has(tag);
  if (!isRawText && !RCDATA_ELEMENTS.has(tag)) {
    return lowerJsxChildren(children, ctx);
  }
  const parts: (string | Expression)[] = [];
  for (const child of flattenJsxChildren(children, ctx)) {
    if (child.type === 'JSXText') {
      const text = normalizeJsxText(child.value);
      if (text !== '') {
        parts.push(text);
      }
    } else if (child.type !== 'JSXExpressionContainer') {
      throw new InvalidModuleError(
        'dom-nesting',
        `<${tag}> takes text only: the HTML parser would not build an element there.`,
        [child.start, child.end]
      );
    } else if (child.expression.type !== 'JSXEmptyExpression') {
      parts.push(child.expression);
    }
  }
  if (isRawText) {
    const text = parts.map((part) => (typeof part === 'string' ? part : rawTextLiteral(tag, part)));
    // Only `</` could end the element early; nothing else is decoded here.
    return text.length === 0
      ? []
      : [{ op: OpKind.Static, html: text.join('').replace(/<\//g, '<\\/') }];
  }
  if (parts.length < 2) {
    return lowerJsxChildren(children, ctx);
  }
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  return [
    {
      op: OpKind.Hole,
      value: lowerTemplateValue(parts, ctx, range),
      shape: Shape.Text,
      effect: null,
      stringify: true,
    },
  ];
}

function rawTextLiteral(tag: string, expression: Expression): string {
  const node = unwrapExpression(expression);
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  throw new InvalidModuleError(
    'raw-text-content',
    `<${tag}> takes a string literal; set dynamic content with dangerouslySetInnerHTML.`,
    [expression.start, expression.end]
  );
}

/** Lowers a JSX child list — the shared path for fragment-rooted trees. */
export function lowerJsxChildren(children: readonly JSXChild[], ctx: LowerContext): Op[] {
  return mergeStaticText(
    flattenJsxChildren(children, ctx).flatMap((child) => lowerChild(child, ctx))
  );
}

export function mergeStaticText(ops: Op[]): Op[] {
  const merged: Op[] = [];
  for (const op of ops) {
    const previous = merged[merged.length - 1];
    if (previous?.op === OpKind.Static && op.op === OpKind.Static) {
      previous.html += op.html;
    } else {
      merged.push(op);
    }
  }
  return merged;
}

export function flattenJsxChildren(
  children: readonly JSXChild[],
  ctx: LowerContext,
  /** A `q:type` fragment stays one child: it projects, and is described, as a unit. */
  keepTyped = false
): JSXChild[] {
  return children.flatMap((child) => {
    const value = ctx.jsx.read(child);
    return value.kind === JsxValueKind.Fragment &&
      !(keepTyped && findDirective(child, QwikDirective.Type) !== undefined)
      ? flattenJsxChildren(value.node.children, ctx, keepTyped)
      : [child];
  });
}

export function lowerChild(child: JSXChild, ctx: LowerContext): Op[] {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(child.value);
      return text === '' ? [] : [{ op: OpKind.Static, html: text }];
    }
    case 'JSXElement':
      return [lowerJsx(child, ctx)];
    case 'JSXExpressionContainer': {
      if (child.expression.type === 'JSXEmptyExpression') {
        return [];
      }
      // The parser would wrap dynamic rows in a `tbody` past the range markers.
      if (ctx.elementStack.at(-1) === 'table') {
        throw new InvalidModuleError(
          'dom-nesting',
          'Dynamic rows must sit inside <tbody>, <thead> or <tfoot>: the HTML parser would insert a body around them.',
          [child.start, child.end]
        );
      }
      return lowerRenderExpression(child.expression, ctx);
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

export function lowerRenderExpression(expression: Expression, ctx: LowerContext): Op[] {
  expression = unwrapExpression(expression);
  const value = ctx.jsx.read(expression);
  const branch = readRenderBranch(value);
  if (branch !== null) {
    return [
      lowerBranch(branch.test, branch.then, branch.else, ctx, (arm) =>
        lowerRenderExpression(arm, ctx)
      ),
    ];
  }
  switch (value.kind) {
    case JsxValueKind.Empty:
      if (expression.type !== 'Identifier' || ctx.bindings.reference(expression) === null) {
        return [];
      }
      break;
    case JsxValueKind.Element:
      return [lowerJsx(value.node, ctx)];
    case JsxValueKind.Fragment:
      return lowerJsxChildren(value.node.children, ctx);
    case JsxValueKind.Collection:
      return [lowerArray(value.node, ctx)];
  }
  // A literal array in render position is a fragment spelled differently.
  if (
    expression.type === 'ArrayExpression' &&
    expression.elements.every((element) => element !== null && element.type !== 'SpreadElement')
  ) {
    return expression.elements.flatMap((element) =>
      lowerRenderExpression(element as Expression, ctx)
    );
  }
  if (value.hasJsxValue) {
    const computed = lowerComputedExpressionValue(
      expression,
      ctx,
      'content',
      QrlPayloadKind.Function,
      'content'
    );
    const lifetime = ctx.plan.lifetimes.length;
    ctx.plan.lifetimes.push({
      id: lifetime,
      parent: 0,
      owner: LifetimeOwner.DynamicValue,
      commit: LifetimeCommit.AtomicRange,
    });
    return [
      {
        op: OpKind.Content,
        render: computed.resume.qrl,
        id: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
        lifetime,
      },
    ];
  }
  return lowerText(expression, ctx);
}

export function readRenderBranch(value: JsxValue) {
  if (value.kind === JsxValueKind.Conditional && value.hasJsxValue) {
    return {
      test: value.node.test,
      then: createBranchArm(value.node.consequent, value.then),
      else: createBranchArm(value.node.alternate, value.else),
    };
  }
  if (value.kind === JsxValueKind.Logical && value.node.operator === '&&') {
    return {
      test: value.node.left,
      then: createBranchArm(value.node.right, value.right),
      else: null,
    };
  }
  return null;
}

function createBranchArm(expression: Expression, value: JsxValue): BranchArm {
  return {
    expression: value.kind === JsxValueKind.Empty ? null : expression,
    range: [expression.start, expression.end],
  };
}
