/**
 * Lowers a component function's param, setup and render into one Program — shared by module-level
 * declarations and nested `component$` values.
 */
import type { DiscoveredComponent } from './discover';
import { pushQrl, type LowerContext } from './lower-context';
import { createCapturedContext } from './ast/capture-analysis';
import { lowerRenderExpression } from './lower-children';
import { childrenReadError, lowerComponentParameter } from './lower-parameter';
import { lowerSetup } from './lower-setup';
import type { SetupLocals } from './locals';
import {
  BoundaryKind,
  FnBodyKind,
  ProgramBodyKind,
  QrlBodyKind,
  QrlPayloadKind,
  type Qrl,
  type QrlUse,
} from '../schema';

export interface LoweredComponentBody {
  program: number;
  parameter: {
    pattern: number;
    surface: NonNullable<ReturnType<typeof lowerComponentParameter>['surface']>;
  } | null;
}

export function lowerComponentBody(
  component: Pick<DiscoveredComponent, 'param' | 'setupStatements' | 'renderExpression' | 'fn'>,
  ctx: LowerContext,
  /** Bindings a nested component closes over — locals of its setup from the start. */
  capturedLocals: SetupLocals = new Map()
): LoweredComponentBody {
  const plan = ctx.plan;
  const loweredParameter = lowerComponentParameter(component, ctx);
  diagnoseChildrenReads(ctx);
  ctx.styleScopes = [];
  const setup = lowerSetup(
    component.setupStatements,
    ctx,
    new Map([...capturedLocals, ...loweredParameter.locals])
  );
  ctx.locals = setup.locals;
  recordSetupAwaits(ctx, component.fn);
  const rootOps =
    component.renderExpression === null
      ? []
      : lowerRenderExpression(component.renderExpression, ctx);
  plan.programs.push({
    body: { kind: ProgramBodyKind.Ops, ops: rootOps },
    setup: [...loweredParameter.setup, ...setup.setup],
    params: [],
    lifetime: 0,
    needsId: false,
    async: component.fn.async === true,
  });
  if (component.param !== null) {
    plan.payloads.push({
      range: component.param.range,
      constants: [],
      qrls: [],
      reads: [],
      awaits: [],
      useIds: [],
      renders: [],
      temps: [],
    });
  }
  return {
    program: plan.programs.length - 1,
    parameter:
      loweredParameter.surface === null
        ? null
        : { pattern: plan.payloads.length - 1, surface: loweredParameter.surface },
  };
}

/** An authored await lands on the payload that prints it: the innermost one holding it. */
export function recordSetupAwaits(ctx: LowerContext, fn: DiscoveredComponent['fn']): void {
  for (const node of ctx.bindings.awaitsOf(fn)) {
    let target: (typeof ctx.plan.payloads)[number] | null = null;
    for (const payload of ctx.plan.payloads) {
      const [start, end] = payload.range;
      if (start > node.start || end < node.end) {
        continue;
      }
      if (target === null || end - start < target.range[1] - target.range[0]) {
        target = payload;
      }
    }
    target?.awaits.push({
      range: [node.start, node.end],
      argumentRange: [node.argument.start, node.argument.end],
    });
  }
}

function diagnoseChildrenReads(ctx: LowerContext): void {
  if (ctx.propsBinding === null) {
    return;
  }
  for (const { node } of ctx.bindings.referencesOf(ctx.propsBinding)) {
    const parent = ctx.bindings.parentOf(node);
    if (
      parent?.type === 'MemberExpression' &&
      !parent.computed &&
      parent.object === node &&
      parent.property.type === 'Identifier' &&
      parent.property.name === 'children'
    ) {
      throw childrenReadError([parent.start, parent.end]);
    }
  }
}

/** What a component is, everywhere it appears: a Program body behind the `(props, ctx)` render ABI. */
export function pushComponentQrl(
  component: Pick<DiscoveredComponent, 'fn' | 'param' | 'setupStatements' | 'renderExpression'> & {
    statement: { start: number; end: number };
  },
  ctx: LowerContext,
  delivery: {
    identity: Parameters<typeof pushQrl>[1]['identity'];
    ctxName: string;
    /** A nested `component$` value prints inline instead of becoming a chunk. */
    inline?: true;
    captures: Qrl['captures'];
    functions?: Qrl['functions'];
    args?: QrlUse['args'];
    /** Bindings the body closes over: its own setup locals from the start. */
    scoped?: SetupLocals;
    /** Needs the lowered parameter, so it is built once the body is down. */
    declaration?: (parameter: LoweredComponentBody['parameter']) => Qrl['declaration'];
  }
): { index: number; use: QrlUse } {
  const fn = component.fn;
  // A component root answers to wherever it is rendered, never to the tags around its declaration.
  const inner = {
    ...createCapturedContext(ctx, delivery.captures),
    styleScopes: [],
    elementStack: [],
    propsBinding: null,
  };
  const { program, parameter } = lowerComponentBody(component, inner, delivery.scoped);
  const body = fn.body!;
  return pushQrl(
    inner,
    {
      identity: delivery.identity,
      ctxName: delivery.ctxName,
      boundary: {
        kind: BoundaryKind.Component,
        ...(delivery.inline === undefined ? {} : { inline: delivery.inline }),
      },
      payloadKind: QrlPayloadKind.Function,
      authoredAsync: fn.async === true,
      body: { b: QrlBodyKind.Program, program },
      captures: delivery.captures,
      ...(delivery.functions === undefined ? {} : { functions: delivery.functions }),
      ...(delivery.declaration === undefined
        ? {}
        : { declaration: delivery.declaration(parameter) }),
      params: { authored: component.param === null ? 0 : 1, used: [], sources: [] },
      origin: {
        range: [component.statement.start, component.statement.end],
        functionRange: [fn.start, fn.end],
        calleeRange: null,
        argumentRanges: [],
        paramRanges: component.param === null ? [] : [component.param.range],
        bodyRange: [body.start, body.end],
        bodyKind: body.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
      },
    },
    delivery.args ?? []
  );
}
