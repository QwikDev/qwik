/** Component tags: targets, props, props chunks and `$` prop boundaries. */
import type {
  Expression,
  JSXAttributeItem,
  JSXElement,
  JSXIdentifier,
  JSXMemberExpression,
} from 'oxc-parser';
import {
  ResumeKind,
  BoundaryKind,
  ComponentPropsKind,
  ComponentTargetKind,
  ExprKind,
  FnBodyKind,
  HandlerKind,
  LifetimeOwner,
  OpKind,
  ProjectionKind,
  PropKind,
  PropsPartKind,
  QrlBodyKind,
  QrlPayloadKind,
  SeedKind,
  ValueKind,
  type LocalId,
  type Op,
  type Qrl,
  type QrlUse,
} from '../schema';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { eventScopeName } from './events';
import { lowerEventAttribute, qrlAttributeExpression } from './lower-event';
import { isFunctionLike, jsxAttributeName, unwrapExpression } from './ast/utils';
import {
  lowerExpressionValue,
  lowerInlineExpressionValue,
  recordPayloadJsx,
  recordPayloadReads,
  trySignalReadValue,
} from './lower-expr';
import type { LowerContext } from './lower-context';
import { pushPayload, pushQrl, QrlIdentityKind } from './lower-context';
import { collectCaptures, lowerCaptures } from './ast/capture-analysis';
import { LocalKind } from './locals';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';
import { QRL_SUFFIX, QwikDirective, SegmentContext } from '../words';
import { lowerFunctionQrl, lowerQrlArgument, type QrlArgumentBoundary } from './lower-function';
import { isHandlerList, lowerAttribute } from './lower-element';
import { isProjectionChild, lowerDynamicSlotSegment, lowerProjections } from './lower-projection';
import { lowerContentRange } from './lower-render-qrl';
/**
 * Lowers a JSX render tree to structural ops. Text stays RAW in the plan — each generator folds
 * with its own escaping (SSR streams raw, CSR templates escape). Dynamic arms land per example.
 */
export function requireComponentBinding(node: JSXIdentifier, ctx: LowerContext): LocalId {
  const binding = ctx.bindings.reference(node);
  if (binding === null) {
    throw new InvalidModuleError(
      'unresolved-component',
      `The component "${node.name}" is not declared in this scope.`,
      [node.start, node.end]
    );
  }
  return binding;
}

/** `<UI.Button />` reads a member chain whose root is a binding. */
export function jsxMemberIr(node: JSXMemberExpression, ctx: LowerContext): ValueIR {
  const object = node.object;
  const obj: ValueIR =
    object.type === 'JSXMemberExpression'
      ? jsxMemberIr(object, ctx)
      : { kind: ValueIrKind.BindingRead, binding: requireComponentBinding(object, ctx) };
  return { kind: ValueIrKind.Member, obj, name: node.property.name };
}

export function jsxMemberRoot(node: JSXMemberExpression): JSXIdentifier {
  return node.object.type === 'JSXMemberExpression' ? jsxMemberRoot(node.object) : node.object;
}

/** A tag bound to a live alias (`const Tag = props.as`) reads like a member tag. */
export function aliasTagTarget(tag: JSXIdentifier, ctx: LowerContext) {
  const binding = ctx.bindings.reference(tag);
  const local = binding === null ? undefined : ctx.locals.get(binding);
  return local?.kind === LocalKind.PropMember ? { value: local.read, root: local.binding } : null;
}

/** The enclosing foreign namespace, omitted from the op when there is none. */
export function tagNamespace(namespace: 'svg' | 'math' | null): { namespace?: 'svg' | 'math' } {
  return namespace === null ? {} : { namespace };
}

/** A tag read from props or a setup local can change; a module object is fixed. */
export function lowerDynamicTag(
  element: JSXElement,
  attributes: readonly JSXAttributeItem[],
  value: ValueIR,
  root: LocalId,
  ctx: LowerContext
): Op {
  const target = { t: ComponentTargetKind.Dynamic, value, ...tagNamespace(ctx.namespace) } as const;
  const lower = () => lowerComponentOp(element, attributes, target, ctx);
  if (!ctx.locals.has(root) && root !== ctx.propsBinding) {
    return lower();
  }
  return lowerContentRange(
    element,
    [element],
    ctx,
    'a dynamic tag',
    SegmentContext.DynamicTag,
    LifetimeOwner.DynamicValue,
    () => ({
      ops: [lower()],
      id: { kind: SeedKind.Content, ordinal: ctx.contentCounter.next++ },
    })
  );
}

export function lowerComponentOp(
  element: JSXElement,
  attributes: readonly JSXAttributeItem[],
  target: Extract<Op, { op: OpKind.Component }>['target'],
  ctx: LowerContext
): Op {
  const childrenAttribute = attributes.find(
    (attribute) => jsxAttributeName(attribute) === 'children'
  );
  if (childrenAttribute !== undefined) {
    throw new InvalidModuleError(
      'children-attribute',
      'Pass children as JSX children; a children attribute is not projected.',
      [childrenAttribute.start, childrenAttribute.end]
    );
  }
  const children = element.children.filter(isProjectionChild);
  const child = children.length === 1 ? children[0] : null;
  if (
    child?.type === 'JSXExpressionContainer' &&
    child.expression.type !== 'JSXEmptyExpression' &&
    ctx.jsx.factory(child.expression) !== null
  ) {
    throw new InvalidModuleError(
      'children-function',
      'Pass a render function through a named prop; children are projected content.',
      [child.start, child.end]
    );
  }
  // Props lower before projections: segment ordinals follow the authored order.
  const props = lowerComponentProps(attributes, ctx);
  const projections = lowerProjections(element.children, ctx);
  return {
    op: OpKind.Component,
    target,
    props,
    projections,
    ...(projections.some(
      (projection) => projection.kind === ProjectionKind.Render && projection.nameUse !== undefined
    )
      ? { dynamicSlot: lowerDynamicSlotSegment(element, ctx) }
      : {}),
    id: { kind: SeedKind.Component, ordinal: ctx.componentCounter.next++ },
    lifetime: 0,
    blockingSuspense: false,
  };
}

function lowerComponentProps(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  const onlyAttribute = attributes.length === 1 ? attributes[0] : null;
  if (onlyAttribute?.type === 'JSXSpreadAttribute') {
    const expression = unwrapExpression(onlyAttribute.argument);
    const binding = ctx.bindings.reference(expression);
    if (binding !== null && ctx.locals.get(binding)?.kind === LocalKind.PropRest) {
      return {
        c: ComponentPropsKind.Entries as const,
        props: [
          {
            k: PropKind.Spread as const,
            value: lowerInlineExpressionValue(
              expression,
              ctx,
              collectCaptures(expression, ctx, new Set())
            ),
            effect: null,
          },
        ],
      };
    }
  }
  if (
    attributes.some(
      (attribute) =>
        attribute.type === 'JSXSpreadAttribute' &&
        (trySignalReadValue(attribute.argument, ctx) !== null ||
          ctx.bindings
            .freeReferences(attribute.argument)
            .some(({ binding }) => ctx.locals.get(binding)?.kind === LocalKind.PropRest))
    )
  ) {
    return lowerComponentPropsProxy(attributes, ctx);
  }
  const props = attributes
    .map((attribute) => lowerAttribute(attribute, ctx, 'component'))
    .filter((prop) => prop !== null);
  return { c: ComponentPropsKind.Entries as const, props };
}

function lowerComponentPropsProxy(attributes: readonly JSXAttributeItem[], ctx: LowerContext) {
  const compute = lowerPropsChunk(attributes, ctx, QrlPayloadKind.Function);
  return { c: ComponentPropsKind.Proxy as const, compute };
}

/** One chunk building the props object in authored order: spreads, values and QRL entries. */
export function lowerPropsChunk(
  attributes: readonly JSXAttributeItem[],
  ctx: LowerContext,
  payloadKind: QrlPayloadKind
): QrlUse {
  const parts: Qrl['propsParts'] = [];
  const expressions: Expression[] = [];
  const payloads: number[] = [];
  const addExpression = (
    expression: Expression,
    part: { kind: PropsPartKind.Spread } | { kind: PropsPartKind.Expression; name: string }
  ) => {
    const payload = pushPayload(ctx, [expression.start, expression.end]);
    const factory =
      part.kind === PropsPartKind.Expression ? lowerPropFactory(expression, ctx, part.name) : null;
    if (factory === null) {
      recordPayloadJsx(ctx, payload, expression);
    } else {
      ctx.plan.payloads[payload].qrls.push({
        range: [expression.start, expression.end],
        use: factory,
      });
    }
    expressions.push(expression);
    payloads.push(payload);
    parts.push({ ...part, value: payload });
  };
  for (const attribute of attributes) {
    if (attribute.type === 'JSXSpreadAttribute') {
      addExpression(attribute.argument, { kind: PropsPartKind.Spread });
      continue;
    }
    const name = jsxAttributeName(attribute)!;
    if (name === QwikDirective.Slot || name === QwikDirective.Type) {
      continue;
    }
    const scope = eventScopeName(name);
    if (scope !== null) {
      const authored = qrlAttributeExpression(attribute);
      // A composed handler value (`cond ? [a, $(...)] : b`) is a plain entry; its markers extract.
      if (authored !== null && !isFunctionLike(authored) && !isHandlerList(authored)) {
        addExpression(authored, { kind: PropsPartKind.Expression, name });
        continue;
      }
      const lowered = lowerEventAttribute(attribute, ctx, name, scope);
      if (lowered === null) {
        continue;
      }
      const { event, expression } = lowered;
      const handler = event.handlers.length === 1 ? event.handlers[0] : null;
      if (
        handler?.h === HandlerKind.Value &&
        handler.value.v === ValueKind.Computed &&
        handler.value.resume.r === ResumeKind.Inline
      ) {
        addExpression(expression, { kind: PropsPartKind.Expression, name });
        continue;
      }
      if (handler?.h !== HandlerKind.Value || handler.value.v !== ValueKind.Qrl) {
        throw new UnsupportedError('a non-QRL component event handler');
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: handler.value.use });
      continue;
    }
    if (name.endsWith(QRL_SUFFIX)) {
      const expression = qrlAttributeExpression(attribute);
      if (expression === null) {
        continue;
      }
      expressions.push(expression);
      parts.push({ kind: PropsPartKind.Event, name, use: lowerQrlProp(expression, ctx, name) });
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
  const { captures, args, refs } = lowerCaptures(expressions, ctx, 'component props');
  for (const payload of payloads) {
    recordPayloadReads(ctx, payload, refs);
  }
  const range: [number, number] = [attributes[0].start, attributes[attributes.length - 1].end];
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: 'props' },
      ctxName: 'props',
      boundary: { kind: BoundaryKind.Implicit, role: 'expression' },
      payloadKind,
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
  return use;
}

function propQrlBoundary(
  expression: Expression,
  name: string,
  subject: string,
  role: string
): QrlArgumentBoundary {
  return {
    nameCtx: name,
    subject,
    ctxName: name,
    boundary: { kind: BoundaryKind.Implicit, role },
    origin: {
      range: [expression.start, expression.end],
      calleeRange: null,
      argumentRanges: [],
    },
  };
}

function lowerPropFactory(expression: Expression, ctx: LowerContext, name: string) {
  const factory = ctx.jsx.factory(expression);
  return factory === null
    ? null
    : lowerFunctionQrl(
        factory.fn,
        ctx,
        propQrlBoundary(expression, name, 'a JSX prop factory', 'jsx-factory')
      );
}

/** Any `$` prop of a component is a QRL boundary under its authored key. */
function lowerQrlProp(expression: Expression, ctx: LowerContext, name: string) {
  return lowerQrlArgument(expression, ctx, propQrlBoundary(expression, name, 'a QRL prop', 'prop'));
}

export function lowerComponentPropValue(
  expression: Expression,
  ctx: LowerContext,
  name: string,
  /** The value already is what the prop takes, so wrapping it in a QRL would only add a chunk. */
  passThrough = false
) {
  const use =
    name.endsWith(QRL_SUFFIX) && !passThrough
      ? lowerQrlProp(expression, ctx, name)
      : lowerPropFactory(expression, ctx, name);
  if (use !== null) {
    return { v: ValueKind.Qrl as const, use };
  }
  return (
    tryLowerBindingPassValue(expression, ctx) ??
    lowerExpressionValue(expression, ctx, name, true, QrlPayloadKind.Function)
  );
}

/** A local passed as-is is a snapshot either way, so an identity QRL would only add a chunk. */
function tryLowerBindingPassValue(expression: Expression, ctx: LowerContext) {
  if (expression.type !== 'Identifier') {
    return null;
  }
  const binding = ctx.bindings.reference(expression);
  const kind = binding === null ? undefined : ctx.locals.get(binding)?.kind;
  switch (kind) {
    case LocalKind.Const:
    case LocalKind.Mutable:
    case LocalKind.Signal:
    case LocalKind.Store:
    case LocalKind.Qrl:
      return lowerInlineExpressionValue(
        expression,
        ctx,
        collectCaptures(expression, ctx, new Set())
      );
    default:
      return null;
  }
}
