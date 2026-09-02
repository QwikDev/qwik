import type { Expression, JSXAttributeItem, JSXChild, JSXElement, Node } from 'oxc-parser';
import {
  BoundaryKind,
  ComponentPropsKind,
  ComponentTargetKind,
  ExprKind,
  FnBodyKind,
  HandlerKind,
  OpKind,
  PropKind,
  PropsPartKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type Op,
  type Prop,
  type Qrl,
} from '../schema';
import { normalizeJsxText } from './ast/jsx-text';
import { normalizeAttributeName, VOID_ELEMENTS } from '../html';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { eventScopeName } from './events';
import { lowerEventAttribute } from './lower-event';
import { lowerText } from './lower-hole';
import { lowerBranch } from './lower-branch';
import { identifierName, unwrapExpression } from './ast/utils';
import { lowerExpressionValue, recordPayloadAliasReads, trySignalReadValue } from './lower-expr';
import type { LowerContext } from './lower-context';
import { pushPayload, pushQrl, QrlIdentityKind } from './lower-context';
import { lowerArray } from './lower-array';
import { lowerCaptures } from './ast/capture-analysis';
import { findRuntimeJsx } from './ast/returns-jsx';
import { QwikDirective, SegmentContext } from '../words';

/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function lowerJsx(element: JSXElement, ctx: LowerContext): Op {
  const opening = element.openingElement;
  const nameNode = opening.name;
  if (nameNode.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a non-native JSX tag');
  }
  if (/^[A-Z]/.test(nameNode.name)) {
    const binding = ctx.bindings.reference(nameNode);
    if (binding === null) {
      throw new InvalidModuleError(
        'unresolved-component',
        `The component "${nameNode.name}" is not declared in this scope.`,
        [nameNode.start, nameNode.end]
      );
    }
    if (ctx.coreBindings.get(binding) === 'Slot') {
      return lowerSlotMarker(element, ctx);
    }
    return {
      op: OpKind.Component,
      target: { t: ComponentTargetKind.Raw, binding },
      props: lowerComponentProps(opening.attributes, ctx),
      projections: lowerProjections(element.children, ctx),
      id: { kind: SeedKind.Component, ordinal: ctx.componentCounter.next++ },
      lifetime: 0,
      blockingSuspense: false,
    };
  }
  if (!/^[a-z]/.test(nameNode.name)) {
    throw new UnsupportedError('a non-native JSX tag');
  }
  const tag = nameNode.name;
  const props = opening.attributes
    .filter((attribute) => !isKeyAttribute(attribute))
    .map((attribute) => lowerAttribute(attribute, ctx, 'element'))
    .filter((prop) => prop !== null);
  const children: Op[] = [];
  for (const child of element.children) {
    children.push(...lowerChild(child, ctx));
  }
  if (VOID_ELEMENTS.has(tag) && children.length > 0) {
    throw new InvalidModuleError(
      'invalid-void-children',
      `The void element <${tag}> cannot have children.`,
      [element.start, element.end]
    );
  }
  return {
    op: OpKind.Element,
    tag,
    void: VOID_ELEMENTS.has(tag),
    styleScopedId: null,
    runtimeScope: false,
    props,
    propsEffect: null,
    children,
  };
}

function lowerComponentProps(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  if (
    attributes.some(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' &&
        trySignalReadValue(attribute.argument, ctx) !== null
    )
  ) {
    return lowerComponentPropsProxy(attributes, ctx);
  }
  return {
    c: ComponentPropsKind.Entries as const,
    props: attributes
      .map((attribute) => lowerAttribute(attribute, ctx, 'component'))
      .filter((prop) => prop !== null),
  };
}

function lowerComponentPropsProxy(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  const parts: Qrl['propsParts'] = [];
  const expressions: Expression[] = [];
  const payloads: number[] = [];
  const addExpression = (
    expression: Expression,
    part: { kind: PropsPartKind.Spread } | { kind: PropsPartKind.Expression; name: string }
  ) => {
    if (findRuntimeJsx(expression) !== null) {
      throw new UnsupportedError('JSX inside an expression value');
    }
    const payload = pushPayload(ctx, [expression.start, expression.end]);
    expressions.push(expression);
    payloads.push(payload);
    parts.push({ ...part, value: payload });
  };
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      addExpression(attribute.argument, { kind: PropsPartKind.Spread });
      continue;
    }
    if (jsxAttributeName(attribute) === QwikDirective.Slot) {
      continue;
    }
    if (attribute.name.type !== 'JSXIdentifier') {
      throw new UnsupportedError('a namespaced JSX attribute');
    }
    const name = attribute.name.name;
    if (name === 'key') {
      throw new UnsupportedError('a component key');
    }
    const scope = eventScopeName(name);
    if (scope !== null) {
      const lowered = lowerEventAttribute(attribute, ctx, name, scope);
      if (lowered === null) {
        continue;
      }
      const { event, expression } = lowered;
      const handler = event.handlers.length === 1 ? event.handlers[0] : null;
      if (handler?.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL component event handler');
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: handler.value.use });
      continue;
    }
    const value = attribute.value;
    if (value === null) {
      parts.push({ kind: PropsPartKind.Static, name, value: true });
    } else if (value.type === 'Literal') {
      parts.push({ kind: PropsPartKind.Static, name, value: value.value });
    } else if (value.type === 'JSXExpressionContainer') {
      if (value.expression.type === 'JSXEmptyExpression') {
        parts.push({ kind: PropsPartKind.Static, name, value: null });
      } else {
        addExpression(value.expression, { kind: PropsPartKind.Expression, name });
      }
    } else {
      throw new UnsupportedError('a dynamic JSX attribute value');
    }
  }
  const { captures, args, refs } = lowerCaptures(expressions, ctx, 'component props', {
    allowProps: true,
  });
  for (const payload of payloads) {
    recordPayloadAliasReads(ctx, payload, refs);
  }
  const range: [number, number] = [attributes[0].start, attributes[attributes.length - 1].end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: 'props' },
      ctxName: 'props',
      boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
      payloadKind: QrlPayloadKind.Value,
      authoredAsync: false,
      body: {
        b: QrlBodyKind.Expr,
        expr: { kind: ExprKind.Js, payload: payloads[0] },
        initialOnly: false,
      },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
      propsParts: parts,
    },
    args
  );
  return { c: ComponentPropsKind.Proxy as const, compute: use };
}

/** Lowers a JSX child list — the shared path for fragment-rooted trees. */
export function lowerJsxChildren(children: readonly JSXChild[], ctx: LowerContext): Op[] {
  const ops: Op[] = [];
  for (const child of children) {
    ops.push(...lowerChild(child, ctx));
  }
  return ops;
}

/** `null`/`undefined` literals in a branch arm render nothing. */
function isNullArm(node: Node | null): boolean {
  if (node === null) {
    return false;
  }
  if (node.type === 'Literal' && node.value === null) {
    return true;
  }
  return node.type === 'Identifier' && node.name === 'undefined';
}

function lowerChild(child: JSXChild, ctx: LowerContext): Op[] {
  switch (child.type) {
    case 'JSXText': {
      const text = normalizeJsxText(child.value);
      return text === '' ? [] : [{ op: OpKind.Static, html: text }];
    }
    case 'JSXElement':
      return [lowerJsx(child, ctx)];
    case 'JSXExpressionContainer': {
      const expression = child.expression;
      if (isPropsChildren(expression, ctx)) {
        return [createSlotOp(ctx)];
      }
      switch (expression.type) {
        // `{/* comment */}` renders nothing.
        case 'JSXEmptyExpression':
          return [];
        case 'ConditionalExpression': {
          const thenJsx = unwrapExpression(expression.consequent);
          const elseJsx = unwrapExpression(expression.alternate);
          const thenIsJsx = thenJsx?.type === 'JSXElement';
          const elseIsJsx = elseJsx?.type === 'JSXElement';
          if (!thenIsJsx && !elseIsJsx) {
            return lowerText(expression, ctx);
          }
          // A null-literal else drops the arm (like `&&`); a null-literal then stays as an
          // EMPTY then program — legacy never inverts the condition.
          return [
            lowerBranch(
              expression.test,
              {
                expression: isNullArm(thenJsx) ? null : expression.consequent,
                range: [expression.consequent.start, expression.consequent.end],
              },
              {
                expression: isNullArm(elseJsx) ? null : expression.alternate,
                range: [expression.alternate.start, expression.alternate.end],
              },
              ctx
            ),
          ];
        }
        case 'LogicalExpression': {
          if (expression.operator !== '&&') {
            return lowerText(expression, ctx);
          }

          return [
            lowerBranch(
              expression.left,
              {
                expression: expression.right,
                range: [expression.right.start, expression.right.end],
              },
              null,
              ctx
            ),
          ];
        }
        case 'CallExpression': {
          const callee = expression.callee;
          const args = expression.arguments;
          if (
            callee.type === 'MemberExpression' &&
            args.length === 1 &&
            args[0].type === 'ArrowFunctionExpression'
          ) {
            const member = callee.property;
            if (member.type === 'Identifier' && member.name === 'map') {
              // handle array.map(fn) JSX children
              return [lowerArray(expression, ctx)];
            }
          }
          throw new UnsupportedError('a JSX child call expression');
        }
        default:
          return lowerText(expression, ctx);
      }
    }
    default:
      throw new UnsupportedError(`JSX child ${child.type}`);
  }
}

function lowerSlotMarker(element: JSXElement, ctx: LowerContext): Op {
  const attributes = element.openingElement.attributes;
  const nameAttribute = attributes.find((attribute) => jsxAttributeName(attribute) === 'name');
  if (attributes.some((attribute) => attribute !== nameAttribute)) {
    throw new UnsupportedError('Slot attributes');
  }
  const fallbackChildren = element.children.filter(isProjectionChild);
  const fallback =
    fallbackChildren.length === 0
      ? null
      : lowerRenderQrl(
          fallbackChildren,
          ctx,
          'a slot fallback',
          SegmentContext.Projection,
          'slot-fallback'
        );
  return createSlotOp(
    ctx,
    nameAttribute === undefined ? '' : readStaticSlotName(nameAttribute),
    fallback
  );
}

function createSlotOp(
  ctx: LowerContext,
  name = '',
  fallback: Extract<Op, { op: OpKind.Slot }>['fallback'] = null
): Op {
  return {
    op: OpKind.Slot,
    name,
    fallback,
    id: { kind: SeedKind.Slot, ordinal: ctx.slotCounter.next++ },
  };
}

function isPropsChildren(node: Node, ctx: LowerContext): boolean {
  const expression = unwrapExpression(node);
  if (
    expression?.type !== 'MemberExpression' ||
    expression.computed ||
    identifierName(expression.property) !== 'children'
  ) {
    return false;
  }
  const object = unwrapExpression(expression.object);
  return (
    object?.type === 'Identifier' &&
    ctx.propsBinding !== null &&
    ctx.bindings.reference(object) === ctx.propsBinding
  );
}

function lowerProjections(
  children: readonly JSXChild[],
  ctx: LowerContext
): Extract<Op, { op: OpKind.Component }>['projections'] {
  return children.filter(isProjectionChild).map((child) => {
    const use = lowerRenderQrl(
      [child],
      ctx,
      'a component projection',
      SegmentContext.Projection,
      'projection'
    );
    return {
      name: readProjectionName(child),
      use,
      id: { kind: SeedKind.Projection, ordinal: ctx.projectionCounter.next++ },
    };
  });
}

function lowerRenderQrl(
  children: JSXChild[],
  ctx: LowerContext,
  subject: string,
  nameCtx: SegmentContext,
  role: string
) {
  const range: [number, number] = [children[0].start, children[children.length - 1].end];
  const { captures, args } = lowerCaptures(children, ctx, subject, { allowProps: true });
  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: [],
    lifetime: 0,
    needsId: false,
    async: false,
  });
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx },
      ctxName: nameCtx,
      boundary: { kind: BoundaryKind.Implicit, role },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures,
      params: { authored: 0, used: [], sources: [] },
      origin: {
        range,
        functionRange: range,
        calleeRange: null,
        argumentRanges: [],
        paramRanges: [],
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  ctx.plan.programs[program].body = {
    kind: ProgramBodyKind.Ops,
    ops: lowerJsxChildren(children, ctx),
  };
  return use;
}

function isProjectionChild(child: JSXChild): boolean {
  if (child.type === 'JSXText') {
    return normalizeJsxText(child.value) !== '';
  }
  return !(
    child.type === 'JSXExpressionContainer' && child.expression.type === 'JSXEmptyExpression'
  );
}

function readProjectionName(child: JSXChild): string {
  if (child.type !== 'JSXElement') {
    return '';
  }
  const attribute = child.openingElement.attributes.find(
    (attribute) => jsxAttributeName(attribute) === QwikDirective.Slot
  );
  return attribute === undefined ? '' : readStaticSlotName(attribute);
}

function readStaticSlotName(attribute: JSXAttributeItem): string {
  if (attribute.type !== 'JSXAttribute') {
    throw new UnsupportedError('a dynamic slot name');
  }
  const value = attribute.value;
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (
    value?.type === 'JSXExpressionContainer' &&
    value.expression.type === 'Literal' &&
    typeof value.expression.value === 'string'
  ) {
    return value.expression.value;
  }
  throw new UnsupportedError('a dynamic slot name');
}

function jsxAttributeName(attribute: JSXAttributeItem): string | null {
  if (attribute.type !== 'JSXAttribute') {
    return null;
  }
  const name = attribute.name;
  if (name.type === 'JSXIdentifier') {
    return name.name;
  }
  return name.type === 'JSXNamespacedName' ? `${name.namespace.name}:${name.name.name}` : null;
}

/** `key` is framework-reserved — it feeds collection keying, never the rendered element. */
function isKeyAttribute(attribute: JSXAttributeItem): boolean {
  return (
    attribute.type === 'JSXAttribute' &&
    attribute.name.type === 'JSXIdentifier' &&
    attribute.name.name === 'key'
  );
}

function lowerAttribute(
  attribute: JSXAttributeItem,
  ctx: LowerContext,
  target: 'component' | 'element'
): Prop | null {
  if (attribute.type === 'JSXSpreadAttribute') {
    if (target !== 'component') {
      throw new UnsupportedError('a JSX spread attribute');
    }
    return {
      k: PropKind.Spread,
      value: lowerExpressionValue(attribute.argument, ctx, 'props'),
      effect: null,
    };
  }
  if (jsxAttributeName(attribute) === QwikDirective.Slot) {
    return null;
  }
  if (attribute.name.type !== 'JSXIdentifier') {
    throw new UnsupportedError('a namespaced JSX attribute');
  }
  const authored = attribute.name.name;
  if (target === 'component' && authored === 'key') {
    throw new UnsupportedError('a component key');
  }
  const scope = eventScopeName(authored);
  if (scope !== null) {
    const lowered = lowerEventAttribute(attribute, ctx, authored, scope);
    if (lowered === null) {
      return null;
    }
    const event = lowered.event;
    return target === 'component' ? { ...event, name: authored } : event;
  }
  const name = target === 'component' ? authored : normalizeAttributeName(authored);
  const value = attribute.value;
  if (value === null) {
    // Absent authored value = bare attribute (`<main hidden>`).
    return { k: PropKind.Static, name, value: true };
  }
  switch (value.type) {
    case 'Literal':
      return {
        k: PropKind.Static,
        name,
        value: value.value,
      };
    case 'JSXExpressionContainer': {
      if (value.expression.type === 'JSXEmptyExpression') {
        return {
          k: PropKind.Static,
          name,
          value: null,
        };
      }
      return {
        k: PropKind.Dynamic,
        name,
        value: lowerExpressionValue(value.expression, ctx, name),
        effect: null,
      };
    }
    default:
      throw new UnsupportedError('a dynamic JSX attribute value');
  }
}
