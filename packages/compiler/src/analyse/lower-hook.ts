import type { Node, Program } from 'oxc-parser';
import {
  AssemblyKind,
  CallTargetKind,
  CaptureAccess,
  CoreOperation,
  DeclarationKind,
  FnBodyKind,
  HookBodyKind,
  SetupKind,
  VisibleTaskEvent,
  type ModulePlan,
} from '../schema';
import { QRL_SUFFIX, QRL_TWIN_SUFFIX, QwikWord } from '../words';
import { coreSetupCalls } from './setup-api';
import { UnsupportedError } from '../errors';
import type { LowerContext } from './lower-context';
import { lowerSetup } from './lower-setup';
import { lowerInlineExpressionValue } from './lower-expr';
import { collectCaptures } from './ast/capture-analysis';
import { identifierName, parameterPattern, unwrapExpression } from './ast/utils';
import { LocalKind, type SetupLocals } from './locals';
import { forEachModuleDeclaration, type HookCandidate } from './ast/returns-jsx';

/**
 * Lowers each custom hook body like a component setup so the linker can read its facts and the
 * generators compile it. A body the setup lowering refuses stays authored, so nothing is lost.
 */
export function lowerHooks(candidates: readonly HookCandidate[], ctx: LowerContext): Set<Node> {
  const lowered = new Set<Node>();
  for (const { fn, name, binding } of candidates) {
    const body = fn.body;
    if (body === null) {
      continue;
    }
    // A block body keeps every return as authored code; an expression body is the result.
    const statements = body.type === 'BlockStatement' ? body.body : [];
    const returned = body.type === 'BlockStatement' ? null : body;
    const locals: SetupLocals = new Map();
    const parameters = fn.params.flatMap((param) =>
      ctx.bindings.bindingsOf(parameterPattern(param)).map((binding) => {
        locals.set(binding, {
          kind: LocalKind.Const,
          access: CaptureAccess.Direct,
          slot: -1,
          binding,
        });
        return { binding, pattern: null, hasDefault: param.type === 'AssignmentPattern' };
      })
    );
    const mark = planMark(ctx.plan);
    ctx.returnsRender = false;
    try {
      const setup = lowerSetup(statements, ctx, locals);
      const resultContext = { ...ctx, locals: setup.locals };
      const returns =
        returned === null
          ? null
          : lowerInlineExpressionValue(
              returned,
              resultContext,
              collectCaptures(returned, resultContext, new Set())
            );
      ctx.plan.hooks.push({
        binding,
        name,
        range: [body.start, body.end],
        declarationKind:
          fn.type === 'FunctionDeclaration' ? DeclarationKind.Function : DeclarationKind.Const,
        bodyKind: body.type === 'BlockStatement' ? FnBodyKind.Block : FnBodyKind.Expression,
        parameters,
        async: fn.async === true,
        body: { kind: HookBodyKind.Setup, setup: setup.setup, returns },
      });
      ctx.plan.assembly.push({ a: AssemblyKind.Hook, hook: ctx.plan.hooks.length - 1 });
      lowered.add(fn);
    } catch (error) {
      if (!(error instanceof UnsupportedError)) {
        throw error;
      }
      restorePlan(ctx.plan, mark);
    } finally {
      ctx.returnsRender = true;
    }
  }
  return lowered;
}

type PlanMark = [keyof ModulePlan, number][];

function planMark(plan: ModulePlan): PlanMark {
  return (Object.keys(plan) as (keyof ModulePlan)[])
    .filter((key) => Array.isArray(plan[key]))
    .map((key) => [key, (plan[key] as unknown[]).length]);
}

/** Drops everything a refused lowering appended, so the plan matches the authored fallback. */
function restorePlan(plan: ModulePlan, mark: PlanMark): void {
  for (const [key, length] of mark) {
    (plan[key] as unknown[]).length = length;
  }
}

/**
 * `const useX$ = implicit$FirstArg(useTaskQrl)` marks a core hook under a custom name: the alias is
 * a hook whose only setup call is that core operation, so the linker knows its facts.
 */
export function lowerCoreHookAliases(program: Pick<Program, 'body'>, ctx: LowerContext): void {
  forEachModuleDeclaration(program, (declaration) => {
    if (declaration.type !== 'VariableDeclaration') {
      return;
    }
    for (const declarator of declaration.declarations) {
      const init = declarator.init === null ? null : unwrapExpression(declarator.init);
      const name = identifierName(declarator.id);
      const binding = ctx.bindings.declaration(declarator.id);
      if (init?.type !== 'CallExpression' || name === null || binding === null) {
        continue;
      }
      const callee = ctx.bindings.reference(init.callee);
      const wrapped = init.arguments.length === 1 ? init.arguments[0] : null;
      const wrappedBinding =
        wrapped?.type === 'Identifier' ? ctx.bindings.reference(wrapped) : null;
      if (
        callee === null ||
        ctx.coreBindings.get(callee) !== QwikWord.ImplicitFirstArg ||
        wrappedBinding === null
      ) {
        continue;
      }
      const core = ctx.coreBindings.get(wrappedBinding);
      const contract = core?.endsWith(QRL_TWIN_SUFFIX)
        ? coreSetupCalls.get(core.slice(0, -QRL_TWIN_SUFFIX.length) + QRL_SUFFIX)
        : undefined;
      if (contract === undefined) {
        continue;
      }
      ctx.plan.hooks.push({
        binding,
        name,
        range: [init.start, init.end],
        declarationKind: DeclarationKind.Const,
        bodyKind: FnBodyKind.Expression,
        parameters: [],
        async: false,
        body: {
          kind: HookBodyKind.Setup,
          setup: [
            {
              s: SetupKind.Call,
              target: { kind: CallTargetKind.Core, operation: contract.operation },
              args: [],
              result: null,
              ...(contract.blocksRender ? { blocksInitialRender: true as const } : {}),
              ...(contract.operation === CoreOperation.VisibleTask
                ? { visibleTaskEvent: VisibleTaskEvent.Visible }
                : {}),
            },
          ],
          returns: null,
        },
      });
    }
  });
}
