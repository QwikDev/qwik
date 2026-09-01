import type { Expression } from 'oxc-parser';
import { OpKind, Shape, type Op } from '../schema';
import { SegmentContext } from '../words';
import { identifierName, unwrapExpression } from './ast/utils';
import { lowerExpressionValue } from './lower-expr';
import type { LowerContext } from './lower-context';
import { LocalKind } from './lower-setup';

type TextPart = { kind: 'static'; text: string } | { kind: 'expression'; expression: Expression };

interface StringConcat {
  parts: TextPart[];
  guaranteedString: boolean;
}

export function lowerText(expression: Expression, ctx: LowerContext): Op[] {
  const node = unwrapExpression(expression);
  let concat: StringConcat | null = null;
  if (node?.type === 'BinaryExpression' && node.operator === '+') {
    concat = tryStringConcat(node, ctx);
  }
  if (concat === null || !concat.guaranteedString) {
    return [createTextHole(expression, ctx, false)];
  }

  const ops: Op[] = [];
  let staticText = '';
  for (const part of concat.parts) {
    if (part.kind === 'static') {
      staticText += part.text;
      continue;
    }

    if (staticText !== '') {
      ops.push({ op: OpKind.Static, html: staticText });
      staticText = '';
    }
    // An extracted operand renders alone, so the effect must keep the JS `+` coercion.
    ops.push(createTextHole(part.expression, ctx, true));
  }
  if (staticText !== '') {
    ops.push({ op: OpKind.Static, html: staticText });
  }
  return ops;
}

function createTextHole(expression: Expression, ctx: LowerContext, stringify: boolean): Op {
  return {
    op: OpKind.Hole,
    value: lowerExpressionValue(expression, ctx, SegmentContext.Text),
    shape: Shape.Text,
    effect: null,
    stringify,
  };
}

function tryStringConcat(expression: Expression, ctx: LowerContext): StringConcat | null {
  const node = unwrapExpression(expression);
  switch (node?.type) {
    case 'Literal': {
      if (typeof node.value === 'string') {
        // Markup characters would stream raw into SSR — the computed hole escapes at runtime.
        if (/[&<>]/.test(node.value)) {
          return null;
        }
        return { parts: [{ kind: 'static', text: node.value }], guaranteedString: true };
      }
      if (typeof node.value === 'number' || typeof node.value === 'bigint') {
        return {
          parts: [{ kind: 'static', text: String(node.value) }],
          guaranteedString: false,
        };
      }
      return null;
    }
    case 'MemberExpression': {
      const name = identifierName(node.object);
      const property = node.computed ? null : identifierName(node.property);
      const binding = ctx.bindings.reference(node.object);
      if (
        property !== 'value' ||
        name === null ||
        binding === null ||
        ctx.locals.get(binding)?.kind !== LocalKind.Signal
      ) {
        return null;
      }
      return { parts: [{ kind: 'expression', expression: node }], guaranteedString: false };
    }
    case 'BinaryExpression': {
      if (node.operator !== '+') {
        return null;
      }
      const left = tryStringConcat(node.left, ctx);
      const right = tryStringConcat(node.right, ctx);
      if (left === null || right === null || (!left.guaranteedString && !right.guaranteedString)) {
        return null;
      }
      return {
        parts: [...left.parts, ...right.parts],
        guaranteedString: true,
      };
    }
    default:
      return null;
  }
}
