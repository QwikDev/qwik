import type { ArrowFunctionExpression, Expression, JSXElement, JSXFragment } from 'oxc-parser';
import {
  BoundaryKind,
  CaptureAccess,
  EachSourceKind,
  ExprKind,
  IndexMode,
  FnBodyKind,
  LifetimeCommit,
  LifetimeOwner,
  OpKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  ResumeKind,
  RowKind,
  SeedKind,
  Shape,
  ValueKind,
  type Op,
  type LocalId,
  type Qrl,
  type Value,
  BindingScope,
} from '../schema';
import { SegmentContext } from '../words';
import { UnsupportedError } from '../errors';
import { lowerCaptures } from './ast/capture-analysis';
import { unwrapExpression } from './ast/utils';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { createSegmentSymbolName, sanitizeSegmentName } from '../segment-identity';
import { trySignalReadValue } from './lower-expr';
import { LocalKind } from './lower-setup';
import { lowerJsx, lowerJsxChildren } from './lower-jsx';

export const DESTRUCTURED_WRAPPED_PARAM = 'item';

/** `source.map((item) => <row key={...}/>)` in child position — a keyed, swappable row set. */
export function lowerArray(expression: Expression, ctx: LowerContext): Op {
  switch (expression.type) {
    case 'CallExpression': {
      const callback = expression.arguments[0];
      if (
        expression.callee.type !== 'MemberExpression' ||
        callback?.type !== 'ArrowFunctionExpression'
      ) {
        throw new UnsupportedError('a collection without an inline arrow row');
      }
      switch (callback.body.type) {
        case 'JSXElement':
        case 'JSXFragment':
          return lowerEach(expression.callee.object, callback, callback.body, ctx);
        default:
          throw new UnsupportedError(`the collection row body "${callback.body.type}"`);
      }
    }
    default:
      throw new UnsupportedError(`the collection call "${expression.type}"`);
  }
}

function lowerEach(
  sourceExpression: Expression,
  callback: ArrowFunctionExpression,
  body: JSXElement | JSXFragment,
  ctx: LowerContext
): Op {
  if (callback.params.length > 2) {
    throw new UnsupportedError('a third collection row parameter');
  }
  const source = lowerSource(sourceExpression, ctx);

  const lifetime = ctx.plan.lifetimes.length;
  ctx.plan.lifetimes.push({
    id: lifetime,
    parent: 0,
    owner: LifetimeOwner.Collection,
    commit: LifetimeCommit.AtomicReconcile,
  });

  const localBindings = new Set<LocalId>();
  const paramAliases = new Map<LocalId, { base: LocalId; member: string }>();
  const paramBindings: LocalId[] = [];

  for (const param of callback.params) {
    switch (param.type) {
      case 'Identifier': {
        const binding = ctx.bindings.declaration(param);
        if (binding === null) {
          throw new UnsupportedError(`the unresolved collection parameter "${param.name}"`);
        }
        ctx.plan.bindings[binding].scope = BindingScope.Loop;
        localBindings.add(binding);
        paramBindings.push(binding);
        break;
      }
      case 'ObjectPattern': {
        const binding = ctx.bindings.addSynthetic(DESTRUCTURED_WRAPPED_PARAM, BindingScope.Loop);
        const freshName =
          DESTRUCTURED_WRAPPED_PARAM +
          (ctx.plan.bindings.some(
            (candidate) => candidate.id !== binding && candidate.name === DESTRUCTURED_WRAPPED_PARAM
          )
            ? `_${binding}`
            : '');
        ctx.plan.bindings[binding].name = freshName;
        paramBindings.push(binding);

        for (const property of param.properties) {
          if (property.type === 'RestElement' || property.value.type !== 'Identifier') {
            throw new UnsupportedError('a destructured collection row parameter');
          }
          if (property.key.type !== 'Identifier' || property.computed) {
            throw new UnsupportedError('a destructured collection row parameter');
          }
          // { id } -> 'id'/'id'; { a: b } → klucz 'a', lokalna nazwa 'b'
          const alias = ctx.bindings.declaration(property.value);
          if (alias === null) {
            throw new UnsupportedError(
              `the unresolved collection parameter "${property.value.name}"`
            );
          }
          ctx.plan.bindings[alias].scope = BindingScope.Loop;
          paramAliases.set(alias, { base: binding, member: property.key.name });
          localBindings.add(alias);
        }
        break;
      }
      default: {
        throw new UnsupportedError('a destructured collection row parameter');
      }
    }
  }

  const program = ctx.plan.programs.length;
  ctx.plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: [] },
    setup: [],
    params: paramBindings,
    lifetime,
    needsId: false,
    async: false,
  });
  // A static array's row renders inline in the component: lexical scope, no key, no chunk.
  if (source.s === EachSourceKind.Array) {
    lowerRowOps(body, callback, paramBindings, paramAliases, localBindings, program, ctx, true);
    const shape = deriveRowShape(program, ctx);
    return {
      op: OpKind.Each,
      source,
      key: null,
      row: {
        r: RowKind.Inline,
        program,
        renderId: createSegmentSymbolName(
          ctx.sourceIdentity,
          sanitizeSegmentName(`semantic_collectionRender_${callback.start}_${callback.end}`),
          'synthetic'
        ),
      },
      index: IndexMode.None,
      id: { kind: SeedKind.For, ordinal: ctx.forCounter.next++ },
      lifetime,
      shape,
    };
  }

  // The row's segment comes first (legacy order: for_render before for_key), children after.
  const rowCaptures = lowerCaptures(body, ctx, 'a collection row', { localBindings });
  const rowRange: [number, number] = [body.start, body.end];
  const { index: rowIndex, use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.ForRender },
      ctxName: SegmentContext.ForRender,
      boundary: { kind: BoundaryKind.Implicit, role: 'for' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Program, program },
      captures: rowCaptures.captures,
      params: { authored: callback.params.length, used: [], sources: [] },
      origin: {
        range: rowRange,
        functionRange: [callback.start, callback.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: callback.params.map((param) => [param.start, param.end] as [number, number]),
        bodyRange: [body.start, body.end],
        bodyKind: FnBodyKind.Expression,
      },
    },
    rowCaptures.args
  );
  const key = body.type === 'JSXElement' ? lowerKey(body, callback, ctx, localBindings) : null;
  lowerRowOps(body, callback, paramBindings, paramAliases, localBindings, program, ctx);
  // The row ABI drops unused trailing params: `used` = params some descendant QRL captured.
  const descendants = ctx.plan.qrls.slice(rowIndex + 1);
  ctx.plan.qrls[rowIndex].params.used = paramBindings.filter((binding) =>
    descendants.some((qrl) =>
      qrl.captures.some(
        (capture) =>
          (capture.access === CaptureAccess.LoopValue ||
            capture.access === CaptureAccess.RowIndex) &&
          capture.binding === binding
      )
    )
  );
  const index = deriveIndexMode(paramBindings[1], descendants);

  return {
    op: OpKind.Each,
    source,
    key,
    row: { r: RowKind.Chunk, use },
    index,
    id: { kind: SeedKind.For, ordinal: ctx.forCounter.next++ },
    lifetime,
    shape: deriveRowShape(program, ctx),
  };
}

/** A row's runtime shape: one element wears `q:row`; anything else needs a marker range. */
function deriveRowShape(program: number, ctx: LowerContext): Shape {
  const body = ctx.plan.programs[program].body;
  if (body.kind !== ProgramBodyKind.Ops || body.ops.length === 0) {
    throw new UnsupportedError('an empty collection row');
  }
  if (body.ops.length > 1) {
    return Shape.Many;
  }
  switch (body.ops[0].op) {
    case OpKind.Element:
      return Shape.Element;
    case OpKind.Static:
    case OpKind.Hole:
      return Shape.Text;
    default:
      return Shape.Many;
  }
}

/** A literal array iterates inline; `signal.value` subscribes; anything else refuses (yet). */
function lowerSource(node: Expression, ctx: LowerContext): { s: EachSourceKind; value: Value } {
  const unwrapped = unwrapExpression(node);
  if (unwrapped?.type === 'ArrayExpression') {
    const payload = pushPayload(ctx, [unwrapped.start, unwrapped.end]);
    return {
      s: EachSourceKind.Array,
      value: {
        v: ValueKind.Computed,
        expr: { kind: ExprKind.Js, payload },
        resume: { r: ResumeKind.Inline },
        compilerString: false,
      },
    };
  }
  const value = trySignalReadValue(node, ctx);
  if (value === null) {
    throw new UnsupportedError('a collection source that is not a signal read');
  }
  return { s: EachSourceKind.Reactive, value };
}

/** Who reads the index decides its cost: effects only, or a closure that outlives render. */
function deriveIndexMode(indexBinding: number | undefined, descendants: readonly Qrl[]): IndexMode {
  if (indexBinding === undefined) {
    return IndexMode.None;
  }
  let mode = IndexMode.None;
  for (const qrl of descendants) {
    if (
      !qrl.captures.some(
        (capture) => capture.access === CaptureAccess.RowIndex && capture.binding === indexBinding
      )
    ) {
      continue;
    }
    const escapes = qrl.boundary.kind === BoundaryKind.Implicit && qrl.boundary.role === 'event';
    if (escapes) {
      return IndexMode.Escapes;
    }
    mode = IndexMode.Effects;
  }
  return mode;
}

/** Fills the row program's ops with loop params scoped as LoopValue locals. */
function lowerRowOps(
  body: JSXElement | JSXFragment,
  callback: ArrowFunctionExpression,
  paramBindings: LocalId[],
  paramAliases: Map<LocalId, { base: LocalId; member: string }>,
  localBindings: ReadonlySet<LocalId>,
  program: number,
  ctx: LowerContext,
  /** Inline rows read params lexically — no locals, no captures, values splice in place. */
  lexical = false
): void {
  const outerLocals = ctx.locals;
  const rowLocals = new Map(outerLocals);
  callback.params.forEach((param, position) => {
    if (param.type === 'Identifier') {
      rowLocals.set(paramBindings[position], {
        // Inline params are plain iteration values — the index is a number, not a signal.
        kind: !lexical && position === 1 ? LocalKind.RowIndex : LocalKind.LoopValue,
        access: !lexical && position === 1 ? CaptureAccess.RowIndex : CaptureAccess.LoopValue,
        slot: -1,
        binding: paramBindings[position],
      });
    }
  });

  for (const [binding, { base, member }] of paramAliases) {
    rowLocals.set(binding, {
      kind: LocalKind.PropMember,
      access: CaptureAccess.LoopValue,
      slot: -1,
      binding: base,
      member,
    });
  }

  ctx.locals = rowLocals;
  if (lexical) {
    ctx.inlineParams = localBindings;
    ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: lowerRowBody(body, ctx) };
    ctx.inlineParams = null;
  } else {
    ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: lowerRowBody(body, ctx) };
  }
  ctx.locals = outerLocals;
}

function lowerRowBody(body: JSXElement | JSXFragment, ctx: LowerContext): Op[] {
  return body.type === 'JSXElement' ? [lowerJsx(body, ctx)] : lowerJsxChildren(body.children, ctx);
}

/** The row's `key` attribute — a Function-payload QRL the runtime calls per row with the item. */
function lowerKey(
  row: JSXElement,
  callback: ArrowFunctionExpression,
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>
): Value | null {
  const attribute = row.openingElement.attributes.find(
    (candidate) => candidate.type === 'JSXAttribute' && candidate.name.name === 'key'
  );
  if (attribute === undefined || attribute.type !== 'JSXAttribute') {
    return null;
  }
  const value = attribute.value;
  const keyExpression =
    value?.type === 'JSXExpressionContainer'
      ? value.expression.type === 'JSXEmptyExpression'
        ? null
        : value.expression
      : (value ?? null);
  if (keyExpression === null) {
    return null;
  }
  const { captures, args } = lowerCaptures(keyExpression, ctx, 'a collection key', {
    localBindings,
  });
  const range: [number, number] = [keyExpression.start, keyExpression.end];
  const payload = pushPayload(ctx, range);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.ForKey },
      ctxName: SegmentContext.ForKey,
      boundary: { kind: BoundaryKind.Implicit, role: 'for' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: { b: QrlBodyKind.Js, payload },
      captures,
      params: { authored: callback.params.length, used: [], sources: [] },
      origin: {
        range,
        functionRange: [callback.start, callback.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: callback.params.map((param) => [param.start, param.end] as [number, number]),
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  return { v: ValueKind.Qrl, use };
}
