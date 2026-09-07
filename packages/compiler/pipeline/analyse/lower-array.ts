import type {
  ArrowFunctionExpression,
  BindingPattern,
  Expression,
  JSXElement,
  Node,
  VariableDeclaration,
  VariableDeclarator,
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
  type Expr,
  type Qrl,
  type Value,
  BindingScope,
} from '../schema';
import { SegmentContext } from '../words';
import { ValueIrKind } from '../../src/expr-ir';
import { InvalidModuleError, UnsupportedError } from '../errors';
import { collectCaptures, lowerCaptures, type CollectedCaptures } from './ast/capture-analysis';
import { unwrapExpression } from './ast/utils';
import { JsxValueKind, type JsxValue } from './ast/jsx-analysis';
import { pushPayload, pushQrl, QrlIdentityKind, type LowerContext } from './lower-context';
import { createSegmentSymbolName, sanitizeSegmentName } from '../segment-identity';
import {
  lowerComputedExpressionValue,
  lowerInlineExpressionValue,
  trySignalReadValue,
} from './lower-expr';
import { lowerConstBinding, lowerConstDeclaration } from './lower-setup';
import { LocalKind, type SetupLocals } from './locals';
import { lowerRenderExpression } from './lower-jsx';

export const DESTRUCTURED_WRAPPED_PARAM = 'item';

type RowLowering = (body: Expression, ctx: LowerContext) => Op[];

/** `source.map((item) => <row key={...}/>)` in child position — a keyed, swappable row set. */
export function lowerArray(
  expression: Expression,
  ctx: LowerContext,
  lowerBody: RowLowering = lowerRenderExpression
): Op {
  const collection = ctx.jsx.read(expression);
  if (collection.kind !== JsxValueKind.Collection) {
    throw new UnsupportedError(
      expression.type === 'CallExpression'
        ? 'a collection without an inline arrow row'
        : `the collection call "${expression.type}"`
    );
  }
  const { callback, body } = collection;
  if (callback.async) {
    throw new UnsupportedError('an async collection row');
  }
  if (body === null) {
    throw new UnsupportedError(`the collection row body "${callback.body.type}"`);
  }
  return lowerEach(collection.source, callback, body.expression, body.statements, ctx, lowerBody);
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
          for (const local of ctx.bindings.bindingsOf(param)) {
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
    localBindings
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
  const key = lowerKey(
    body,
    callback,
    statements,
    ctx,
    localBindings,
    paramBindings,
    paramPatterns
  );
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
  row: Expression,
  callback: ArrowFunctionExpression,
  statements: VariableDeclaration[],
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>,
  paramBindings: LocalId[],
  paramPatterns: Map<LocalId, BindingPattern>
): Value | null {
  const value = ctx.jsx.read(row);
  const sources = new Map<Node, Expression>();
  const keyedValue = selectRowKey(value, sources);
  if (keyedValue === null || keyedValue.kind === JsxValueKind.Empty) {
    return null;
  }
  const expressions = [...sources.values()];
  const declarations = ctx.bindings.dependenciesOf(
    expressions,
    statements.flatMap((statement) => statement.declarations)
  );
  const keyPatterns = new Map(paramPatterns);
  if (declarations.length > 0) {
    callback.params.map(readCollectionParameter).forEach((param, index) => {
      if (
        param.type === 'ObjectPattern' ||
        param.type === 'ArrayPattern' ||
        param.type === 'AssignmentPattern'
      ) {
        keyPatterns.set(paramBindings[index], param);
      }
    });
  }
  const { captures, args, refs } = lowerCaptures(
    [...keyPatterns.values(), ...declarations, ...expressions],
    ctx,
    'a collection key',
    localBindings
  );
  const origin = value.kind === JsxValueKind.Conditional ? value.node : expressions[0];
  const range: [number, number] = [origin.start, origin.end];
  const expr = lowerRowKeyExpression(keyedValue, sources, ctx, refs);
  const keyBody = lowerKeyBody(expr, paramBindings, keyPatterns, declarations, ctx);
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

function selectRowKey(value: JsxValue, sources: Map<Node, Expression>): JsxValue | null {
  if (value.kind === JsxValueKind.Conditional) {
    sources.set(value.node, value.node.test);
    const then = selectRowKey(value.then, sources);
    const otherwise = selectRowKey(value.else, sources);
    if (then?.kind === JsxValueKind.Empty || otherwise?.kind === JsxValueKind.Empty) {
      sources.delete(value.node);
      return then?.kind === JsxValueKind.Empty ? otherwise : then;
    }
    if ((then === null) !== (otherwise === null)) {
      throw new UnsupportedError('a conditional collection row without keys in all non-empty arms');
    }
    if (then === null || otherwise === null) {
      return null;
    }
    return then === value.then && otherwise === value.else
      ? value
      : { ...value, then, else: otherwise };
  }
  if (value.kind === JsxValueKind.Logical && value.node.operator === '&&') {
    return selectRowKey(value.right, sources);
  }
  if (value.kind === JsxValueKind.Empty) {
    return value;
  }
  const key = value.kind === JsxValueKind.Element ? readRowKey(value.node) : null;
  if (key === null) {
    return null;
  }
  sources.set(value.node, key);
  return value;
}

function lowerRowKeyExpression(
  value: JsxValue,
  sources: ReadonlyMap<Node, Expression>,
  ctx: LowerContext,
  refs: CollectedCaptures
): Expr {
  const expr = lowerInlineExpressionValue(sources.get(value.node)!, ctx, refs).expr;
  if (value.kind !== JsxValueKind.Conditional) {
    return expr;
  }
  return {
    kind: ExprKind.Conditional,
    test: expr,
    then: lowerRowKeyExpression(value.then, sources, ctx, refs),
    else: lowerRowKeyExpression(value.else, sources, ctx, refs),
  };
}

function readRowKey(row: JSXElement): Expression | null {
  const attribute = row.openingElement.attributes.find(
    (candidate) => candidate.type === 'JSXAttribute' && candidate.name.name === 'key'
  );
  if (attribute === undefined || attribute.type !== 'JSXAttribute') {
    return null;
  }
  const value = attribute.value;
  return value?.type === 'JSXExpressionContainer'
    ? value.expression.type === 'JSXEmptyExpression'
      ? null
      : value.expression
    : (value ?? null);
}

function lowerKeyBody(
  expr: Expr,
  paramBindings: LocalId[],
  paramPatterns: Map<LocalId, BindingPattern>,
  declarations: VariableDeclarator[],
  ctx: LowerContext
): Qrl['body'] {
  if (paramPatterns.size === 0 && declarations.length === 0) {
    return { b: QrlBodyKind.Expr, expr, initialOnly: false };
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
    for (const declaration of declarations) {
      setup.push(lowerConstDeclaration(declaration, ctx, keyLocals));
    }
    const program = ctx.plan.programs.length;
    ctx.plan.programs.push({
      body: { kind: ProgramBodyKind.Expr, expr },
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
