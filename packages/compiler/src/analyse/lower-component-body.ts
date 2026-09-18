/**
 * Lowers a component function's param, setup and render into one Program — shared by module-level
 * declarations and nested `component$` values.
 */
import type { DiscoveredComponent } from './discover';
import type { LowerContext } from './lower-context';
import { lowerRenderExpression } from './lower-jsx';
import { childrenReadError, lowerComponentParameter } from './lower-parameter';
import { lowerSetup } from './lower-setup';
import type { SetupLocals } from './locals';
import { ProgramBodyKind } from '../schema';

export interface LoweredComponentBody {
  program: number;
  parameter: {
    pattern: number;
    surface: NonNullable<ReturnType<typeof lowerComponentParameter>['surface']>;
  } | null;
}

export function lowerComponentBody(
  component: Pick<DiscoveredComponent, 'param' | 'setupStatements' | 'renderExpression'>,
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
    async: false,
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
