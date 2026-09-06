import type {
  ArrowFunctionExpression,
  BindingPattern,
  Expression,
  JSXElement,
  VariableDeclaration,
} from 'oxc-parser';
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
  type PayloadId,
  type Qrl,
  type Value,
  BindingScope,
} from '../schema';
import { SegmentContext } from '../words';
import { ValueIrKind } from '../../src/expr-ir';
import { bindingIdentifiers } from './ast/bindings';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { collectCaptures, lowerCaptures } from './ast/capture-analysis';
import { readReturnedBody, unwrapExpression } from './ast/utils';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { createSegmentSymbolName, sanitizeSegmentName } from '../segment-identity';
import { lowerComputedExpressionValue, trySignalReadValue } from './lower-expr';
import {
  LocalKind,
  lowerConstBinding,
  lowerConstDeclaration,
  type SetupLocals,
} from './lower-setup';
import { lowerRenderExpression } from './lower-jsx';

export const DESTRUCTURED_WRAPPED_PARAM = 'item';

type RowLowering = (body: Expression, ctx: LowerContext) => Op[];

/** `source.map((item) => <row key={...}/>)` in child position — a keyed, swappable row set. */
export function lowerArray(
  expression: Expression,
  ctx: LowerContext,
  lowerBody: RowLowering = lowerRenderExpression
): Op {
  switch (expression.type) {
    case 'CallExpression': {
      const callback = expression.arguments[0];
      if (
        expression.callee.type !== 'MemberExpression' ||
        callback?.type !== 'ArrowFunctionExpression'
      ) {
        throw new UnsupportedError('a collection without an inline arrow row');
      }
      if (callback.async) {
        throw new UnsupportedError('an async collection row');
      }
      const body = readReturnedBody(callback.body);
      if (body === null) {
        throw new UnsupportedError(`the collection row body "${callback.body.type}"`);
      }
      return lowerEach(
        expression.callee.object,
        callback,
        body.expression,
        body.statements,
        ctx,
        lowerBody
      );
    }
    default:
      throw new UnsupportedError(`the collection call "${expression.type}"`);
  }
}

function lowerEach(
  sourceExpression: Expression,
  callback: ArrowFunctionExpression,
  body: Expression,
  statements: VariableDeclaration[],
  ctx: LowerContext,
  lowerBody: RowLowering
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
  const paramPatterns = new Map<LocalId, BindingPattern>();
  const parameters = callback.params.map(readCollectionParameter);

  for (const param of parameters) {
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
      case 'ObjectPattern':
      case 'AssignmentPattern':
      case 'ArrayPattern': {
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

        const aliases = readParameterAliases(param, ctx);
        if (aliases === null) {
          paramPatterns.set(binding, param);
          for (const identifier of bindingIdentifiers(param)) {
            const local = ctx.bindings.declaration(identifier);
            if (local === null) {
              throw new UnsupportedError(
                `the unresolved collection parameter "${identifier.name}"`
              );
            }
            ctx.plan.bindings[local].scope = BindingScope.Loop;
            localBindings.add(local);
          }
          break;
        }

        for (const [alias, member] of aliases) {
          ctx.plan.bindings[alias].scope = BindingScope.Loop;
          paramAliases.set(alias, { base: binding, member });
          localBindings.add(alias);
        }
        break;
      }
      default: {
        throw new UnsupportedError('a destructured collection row parameter');
      }
    }
  }

  if (paramPatterns.size > 0) {
    paramPatterns.clear();
    paramAliases.clear();
    parameters.forEach((param, position) => {
      if (
        param.type === 'ObjectPattern' ||
        param.type === 'ArrayPattern' ||
        param.type === 'AssignmentPattern'
      ) {
        paramPatterns.set(paramBindings[position], param);
      }
    });
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
    lowerRowProgram(
      body,
      statements,
      paramBindings,
      paramAliases,
      paramPatterns,
      localBindings,
      program,
      ctx,
      lowerBody,
      true
    );
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
  const originBody = statements.length === 0 ? body : callback.body;
  const rowCaptures = lowerCaptures(
    [...paramPatterns.values(), originBody],
    ctx,
    'a collection row',
    {
      localBindings,
      allowProps: true,
    }
  );
  const rowRange: [number, number] = [originBody.start, originBody.end];
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
        bodyRange: rowRange,
        bodyKind: originBody.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
      },
    },
    rowCaptures.args
  );
  const key =
    body.type === 'JSXElement'
      ? lowerKey(body, callback, ctx, localBindings, paramBindings, paramPatterns)
      : null;
  if (source.s === EachSourceKind.Derived && key === null) {
    throw new InvalidModuleError('for-key', 'A derived collection requires a row key', [
      body.start,
      body.end,
    ]);
  }
  const setupReads = lowerRowProgram(
    body,
    statements,
    paramBindings,
    paramAliases,
    paramPatterns,
    localBindings,
    program,
    ctx,
    lowerBody
  );
  // Preserve parameters read by setup or captured by descendant QRLs.
  const descendants = ctx.plan.qrls.slice(rowIndex + 1);
  ctx.plan.qrls[rowIndex].params.used = paramBindings.filter(
    (binding) =>
      paramPatterns.has(binding) ||
      setupReads.locals.some(({ local }) => local.binding === binding) ||
      descendants.some((qrl) =>
        qrl.captures.some(
          (capture) =>
            (capture.access === CaptureAccess.LoopValue ||
              capture.access === CaptureAccess.RowIndex) &&
            capture.binding === binding
        )
      )
  );
  const index = deriveIndexMode(
    paramBindings[1],
    descendants,
    paramPatterns.has(paramBindings[1]) ||
      setupReads.locals.some(({ local }) => local.kind === LocalKind.RowIndex)
  );

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

/** The runtime always supplies the index, making its default unreachable. */
function readCollectionParameter(
  param: ArrowFunctionExpression['params'][number],
  position: number
) {
  return position === 1 && param.type === 'AssignmentPattern' ? param.left : param;
}

/** Simple object fields retain the existing member-read fast path. */
function readParameterAliases(
  pattern: BindingPattern,
  ctx: LowerContext
): Map<LocalId, string> | null {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  const aliases = new Map<LocalId, string>();
  for (const property of pattern.properties) {
    if (
      property.type === 'RestElement' ||
      property.value.type !== 'Identifier' ||
      property.key.type !== 'Identifier' ||
      property.computed
    ) {
      return null;
    }
    const binding = ctx.bindings.declaration(property.value);
    if (binding === null) {
      throw new UnsupportedError(`the unresolved collection parameter "${property.value.name}"`);
    }
    aliases.set(binding, property.key.name);
  }
  return aliases;
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

/** Literal arrays render inline; other expressions become direct or derived Sources. */
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
  const value = trySignalReadValue(unwrapped, ctx);
  if (value !== null) {
    return { s: EachSourceKind.Reactive, value };
  }
  return {
    s: EachSourceKind.Derived,
    value: lowerComputedExpressionValue(
      unwrapped,
      ctx,
      SegmentContext.CollectionSource,
      QrlPayloadKind.Function
    ),
  };
}

/** Who reads the index decides its cost: effects only, or a closure that outlives render. */
function deriveIndexMode(
  indexBinding: number | undefined,
  descendants: readonly Qrl[],
  readsSetupIndex: boolean
): IndexMode {
  if (indexBinding === undefined) {
    return IndexMode.None;
  }
  let mode = readsSetupIndex ? IndexMode.Effects : IndexMode.None;
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

/** Lowers row setup and rendering within the callback's lexical scope. */
function lowerRowProgram(
  body: Expression,
  statements: VariableDeclaration[],
  paramBindings: LocalId[],
  paramAliases: Map<LocalId, { base: LocalId; member: string }>,
  paramPatterns: Map<LocalId, BindingPattern>,
  localBindings: ReadonlySet<LocalId>,
  program: number,
  ctx: LowerContext,
  lowerBody: RowLowering,
  /** Inline rows read params lexically — no locals, no captures, values splice in place. */
  lexical = false
) {
  const outerLocals = ctx.locals;
  const rowLocals = new Map(outerLocals);
  paramBindings.forEach((binding, position) => {
    rowLocals.set(binding, {
      // Inline params are plain iteration values — the index is a number, not a signal.
      kind: !lexical && position === 1 ? LocalKind.RowIndex : LocalKind.LoopValue,
      access: !lexical && position === 1 ? CaptureAccess.RowIndex : CaptureAccess.LoopValue,
      slot: -1,
      binding,
    });
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
  const outerInlineParams = ctx.inlineParams;
  ctx.inlineParams = lexical ? localBindings : null;
  try {
    const setupReads = collectCaptures([...paramPatterns.values(), ...statements], ctx, new Set());
    const parameterSetup = lowerParameterPatterns(paramPatterns, paramBindings, ctx, rowLocals);
    ctx.plan.programs[program].setup = [
      ...parameterSetup,
      ...statements.flatMap((statement) =>
        statement.declarations.map((declarator) =>
          lowerConstDeclaration(declarator, ctx, rowLocals)
        )
      ),
    ];
    ctx.plan.programs[program].body = { kind: ProgramBodyKind.Ops, ops: lowerBody(body, ctx) };
    return setupReads;
  } finally {
    ctx.inlineParams = outerInlineParams;
    ctx.locals = outerLocals;
  }
}

function lowerParameterPatterns(
  patterns: Map<LocalId, BindingPattern>,
  params: LocalId[],
  ctx: LowerContext,
  locals: SetupLocals
) {
  return [...patterns].map(([binding, pattern]) => {
    const reads = collectCaptures(pattern, ctx, new Set());
    if (reads.locals.some(({ local }) => params.indexOf(local.binding) > params.indexOf(binding))) {
      throw new UnsupportedError('a collection parameter referencing a later parameter');
    }
    return lowerConstBinding(
      pattern,
      {
        v: ValueKind.Computed,
        expr: {
          kind: ExprKind.Ir,
          ir: {
            kind:
              ctx.locals.get(binding)?.kind === LocalKind.RowIndex
                ? ValueIrKind.SignalRead
                : ValueIrKind.BindingRead,
            binding,
          },
        },
        resume: { r: ResumeKind.Inline },
        compilerString: false,
      },
      ctx,
      locals
    );
  });
}

/** The row's `key` attribute — a Function-payload QRL the runtime calls per row with the item. */
function lowerKey(
  row: JSXElement,
  callback: ArrowFunctionExpression,
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>,
  paramBindings: LocalId[],
  paramPatterns: Map<LocalId, BindingPattern>
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
  const { captures, args } = lowerCaptures(
    [...paramPatterns.values(), keyExpression],
    ctx,
    'a collection key',
    {
      localBindings,
      allowProps: true,
    }
  );
  const range: [number, number] = [keyExpression.start, keyExpression.end];
  const payload = pushPayload(ctx, range);
  const keyBody = lowerKeyBody(payload, paramBindings, paramPatterns, ctx);
  const { use } = pushQrl(
    ctx,
    {
      identity: { kind: QrlIdentityKind.Segment, nameCtx: SegmentContext.ForKey },
      ctxName: SegmentContext.ForKey,
      boundary: { kind: BoundaryKind.Implicit, role: 'for' },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: false,
      body: keyBody,
      captures,
      params: { authored: callback.params.length, used: [], sources: [] },
      origin: {
        range,
        functionRange: [callback.start, callback.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: callback.params
          .map(readCollectionParameter)
          .map((param) => [param.start, param.end] as [number, number]),
        bodyRange: range,
        bodyKind: FnBodyKind.Expression,
      },
    },
    args
  );
  return { v: ValueKind.Qrl, use };
}

function lowerKeyBody(
  payload: PayloadId,
  paramBindings: LocalId[],
  paramPatterns: Map<LocalId, BindingPattern>,
  ctx: LowerContext
): Qrl['body'] {
  if (paramPatterns.size === 0) {
    return { b: QrlBodyKind.Js, payload };
  }
  const outerLocals = ctx.locals;
  const keyLocals = new Map(outerLocals);
  ctx.locals = keyLocals;
  try {
    for (const binding of paramBindings) {
      keyLocals.set(binding, {
        kind: LocalKind.LoopValue,
        access: CaptureAccess.LoopValue,
        binding,
        slot: -1,
      });
    }
    const setup = lowerParameterPatterns(paramPatterns, paramBindings, ctx, keyLocals);
    const program = ctx.plan.programs.length;
    ctx.plan.programs.push({
      body: { kind: ProgramBodyKind.Js, payload },
      setup,
      params: paramBindings,
      lifetime: 0,
      needsId: false,
      async: false,
    });
    return { b: QrlBodyKind.Program, program };
  } finally {
    ctx.locals = outerLocals;
  }
}
