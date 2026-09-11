import {
  BindingScope,
  CaptureAccess,
  SetupKind,
  SurfaceKind,
  type ComponentParameter,
  type Setup,
} from '../schema';
import type { DiscoveredComponent } from './discover';
import type { LowerContext } from './lower-context';
import { collectCaptures } from './ast/capture-analysis';
import { lowerInlineExpressionValue, tryLowerExprIr } from './lower-expr';
import { LocalKind, type SetupLocal, type SetupLocals } from './locals';
import { allocateGeneratedName } from '../names';
import { QwikGenWord } from '../words';
import { ValueIrKind } from '../../src/expr-ir';
import { UnsupportedError } from '../errors';
import type { Expression } from 'oxc-parser';
import { patternResult } from './results';

export function lowerComponentParameter(component: DiscoveredComponent, ctx: LowerContext) {
  const parameter = component.param;
  const locals: SetupLocals = new Map();
  const setup: Setup[] = [];
  let surface: ComponentParameter['surface'] | null = null;
  ctx.propsMembers = new Map();
  ctx.propsBinding = null;
  ctx.locals = locals;
  if (parameter === null) {
    return { surface, setup, locals };
  }
  if (parameter.node.type === 'Identifier') {
    ctx.propsBinding = ctx.bindings.declaration(parameter.node)!;
    surface = { kind: SurfaceKind.Identifier, binding: ctx.propsBinding };
    return { surface, setup, locals };
  }
  const { members, rest } = parameter.object!;
  const restBinding = rest === null ? null : ctx.bindings.declaration(rest)!;
  const fields = members.map(({ node, name }) => ({
    binding: ctx.bindings.declaration(node)!,
    name,
  }));
  ctx.propsMembers = new Map(fields.map(({ binding, name }) => [binding, name]));
  ctx.propsBinding =
    rest !== null || members.some((member) => member.name !== 'children')
      ? generatedBinding(QwikGenWord.ComponentProps, BindingScope.Param, ctx)
      : null;
  surface = { kind: SurfaceKind.Object, binding: ctx.propsBinding, bindings: fields };
  if (ctx.propsBinding !== null) {
    for (const binding of ctx.bindings.bindingsOf(parameter.node)) {
      const value = patternResult(
        parameter.node,
        binding,
        { kind: ValueIrKind.BindingRead, binding: ctx.propsBinding },
        ctx
      );
      if (value !== null) {
        ctx.plan.bindings[binding].result = { value, writes: [], escapes: [] };
      }
    }
  }
  for (const { node, name, defaultValue } of members) {
    if (name === 'children') {
      if (defaultValue !== null) {
        throw new UnsupportedError('a children parameter default');
      }
      continue;
    }
    const local: Extract<SetupLocal, { kind: LocalKind.PropMember }> = {
      kind: LocalKind.PropMember,
      access: CaptureAccess.ComponentProp,
      binding: ctx.propsBinding!,
      member: name,
      slot: -1,
    };
    locals.set(ctx.bindings.declaration(node)!, local);
    if (defaultValue === null) {
      continue;
    }
    if (
      ctx.bindings
        .freeReferences(defaultValue)
        .some(({ binding }) => ctx.propsMembers.has(binding) || binding === restBinding)
    ) {
      throw new UnsupportedError('a prop default referencing another parameter binding');
    }
    if (ctx.bindings.hasShadowedReferences(defaultValue, component.fn.body!)) {
      throw new UnsupportedError('a prop default shadowed by component setup');
    }
    const initializer = lowerPropDefault(defaultValue, local, ctx);
    if (initializer !== null) {
      setup.push(initializer);
    }
  }
  if (rest !== null) {
    const binding = restBinding!;
    const excluded = [...new Set(['children', ...members.map((member) => member.name)])];
    setup.push({ s: SetupKind.PropRest, result: binding, props: ctx.propsBinding!, excluded });
    locals.set(binding, {
      kind: LocalKind.PropRest,
      access: CaptureAccess.Direct,
      binding,
      slot: -1,
    });
  }
  return { surface, setup, locals };
}

function lowerPropDefault(
  expression: Expression,
  local: Extract<SetupLocal, { kind: LocalKind.PropMember }>,
  ctx: LowerContext
): Setup | null {
  const literal = tryLowerExprIr(expression, ctx);
  if (literal?.kind === ValueIrKind.Lit) {
    local.defaultValue = literal;
    return null;
  }
  const initial = lowerInlineExpressionValue(
    expression,
    ctx,
    collectCaptures(expression, ctx, new Set())
  );
  const binding = generatedBinding(QwikGenWord.DefaultValue, BindingScope.Local, ctx);
  local.defaultValue = { kind: ValueIrKind.BindingRead, binding };
  return {
    s: SetupKind.PropDefault,
    result: binding,
    props: local.binding,
    name: local.member,
    initializer: initial.expr,
  };
}

function generatedBinding(name: QwikGenWord, scope: BindingScope, ctx: LowerContext): number {
  return ctx.bindings.addSynthetic(
    allocateGeneratedName(
      name,
      ctx.plan.bindings.map((binding) => binding.name)
    ),
    scope
  );
}
