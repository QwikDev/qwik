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
import { unwrapExpression } from './ast/utils';
import { LocalKind, type SetupLocal, type SetupLocals } from './locals';
import { allocateGeneratedName } from '../names';
import { QwikGenWord } from '../words';
import { ValueIrKind, type ValueIR } from '../schema/value-ir';
import { InvalidModuleError, UnsupportedError } from '../errors';
import type { Expression } from 'oxc-parser';
import type { PropPathStep } from './ast/parameter-members';
import { patternResult } from './results';

/** Children is projected content: `useChildrenInfo()` describes it, `<Slot />` renders it. */
export function childrenReadError(range: [number, number]): InvalidModuleError {
  return new InvalidModuleError(
    'children-read',
    'Read child info with useChildrenInfo(), or render them with <Slot />.',
    range
  );
}

export function lowerComponentParameter(
  component: Pick<DiscoveredComponent, 'param'>,
  ctx: LowerContext
) {
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
    rest !== null || members.length > 0
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
  for (const [index, { node, name, path, defaultValue }] of members.entries()) {
    if (name === 'children') {
      throw childrenReadError([node.start, node.end]);
    }
    const local: Extract<SetupLocal, { kind: LocalKind.PropMember }> = {
      kind: LocalKind.PropMember,
      access: CaptureAccess.ComponentProp,
      binding: ctx.propsBinding!,
      read: pathReadIr({ kind: ValueIrKind.BindingRead, binding: ctx.propsBinding! }, path, ctx),
      slot: -1,
    };
    locals.set(ctx.bindings.declaration(node)!, local);
    if (defaultValue === null) {
      continue;
    }
    // Defaults evaluate left to right in the parameter scope: only earlier members are bound.
    const later = new Set(
      members.slice(index).map((member) => ctx.bindings.declaration(member.node))
    );
    if (
      ctx.bindings
        .freeReferences(defaultValue)
        .some(({ binding }) => later.has(binding) || binding === restBinding)
    ) {
      throw new UnsupportedError('a prop default referencing a later parameter binding');
    }
    const initializer = lowerPropDefault(defaultValue, local, ctx);
    if (initializer !== null) {
      setup.push(initializer);
    }
  }
  if (rest !== null) {
    const binding = restBinding!;
    const excluded = [...new Set(members.map((member) => member.name))];
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

/** `{ user: { tags: [first] }, [KEY]: v }` reads as `root.user.tags[0]` and `root[KEY]`. */
export function pathReadIr(root: ValueIR, path: PropPathStep[], ctx: LowerContext): ValueIR {
  let read = root;
  for (const step of path) {
    read =
      step.kind === 'member'
        ? { kind: ValueIrKind.Member, obj: read, name: step.name }
        : { kind: ValueIrKind.Index, obj: read, key: propKeyIr(step, ctx) };
  }
  return read;
}

/** A computed key must be a literal or a module-level binding: both survive every boundary. */
function propKeyIr(step: Exclude<PropPathStep, { kind: 'member' }>, ctx: LowerContext): ValueIR {
  if (step.kind === 'index') {
    return { kind: ValueIrKind.Lit, value: step.index };
  }
  const key = unwrapExpression(step.key);
  if (key.type === 'Literal' && (typeof key.value === 'string' || typeof key.value === 'number')) {
    return { kind: ValueIrKind.Lit, value: key.value };
  }
  const binding = key.type === 'Identifier' ? ctx.bindings.reference(key) : null;
  if (binding === null || ctx.locals.has(binding) || binding === ctx.propsBinding) {
    throw new UnsupportedError('a computed parameter key that is not a module value');
  }
  return { kind: ValueIrKind.BindingRead, binding };
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
    read: local.read,
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
