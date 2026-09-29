/** Setup calls: which core or custom hook a call is, and how its arguments lower. */
import {
  ArgKind,
  ExportKind,
  ExportTargetKind,
  SetupKind,
  VarKind,
  VisibleTaskEvent,
  BoundaryKind,
  CallTargetKind,
  type CallTarget,
  CoreOperation,
  type Arg,
  type LocalId,
  type QrlArg,
  type Setup,
} from '../schema';
import type { Argument, BindingPattern, CallExpression, Expression } from 'oxc-parser';
import { identifierName, unwrapExpression } from './ast/utils';
import { UnsupportedError } from '../errors';
import { QRL_SUFFIX, QwikHook, QwikMarker } from '../words';
import { createSegmentSourceIdentity, createStyleId } from '../segment-identity';
import { coreSetupCalls, type SetupCallContract } from './setup-api';
import { LocalKind, type SetupLocals } from './locals';
import { type LowerContext } from './lower-context';
import { collectCaptures } from './ast/capture-analysis';
import {
  lowerExpressionPayload,
  lowerInlineExpressionValue,
  resolveQrlBinding,
  tryLowerExprIr,
} from './lower-expr';
import { lowerQrlArgument } from './lower-function';
import { lowerSetupBinding } from './lower-setup';
function lowerHookCallback(
  call: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
): QrlArg {
  const argument = call.arguments[0];
  const expression = argument?.type === 'SpreadElement' ? null : unwrapExpression(argument);
  const binding = expression === null ? null : resolveQrlBinding(expression, ctx);
  if (binding !== null && !call.optional) {
    return { a: ArgKind.QrlBinding, binding };
  }
  return { a: ArgKind.Qrl, use: lowerSetupCallback(call, name, calleeName, ctx) };
}

export function lowerSetupCallback(
  init: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
) {
  const binding = ctx.bindings.reference(init.callee);
  const coreApi = binding === null ? undefined : ctx.coreBindings.get(binding);
  const first = init.arguments[0];
  const argument = first?.type === 'SpreadElement' ? null : unwrapExpression(first);
  if (
    init.optional ||
    argument === null ||
    (coreApi === QwikMarker.Dollar && init.arguments.length !== 1)
  ) {
    throw new UnsupportedError(`${calleeName}() without a first argument`);
  }
  return lowerQrlArgument(argument, ctx, {
    nameCtx: name,
    subject: 'a QRL callback',
    ctxName: calleeName,
    boundary:
      coreApi === QwikMarker.Dollar
        ? { kind: BoundaryKind.Explicit }
        : { kind: BoundaryKind.Implicit, role: 'hook' },
    origin: {
      range: [init.start, init.end],
      calleeRange: [init.callee.start, init.callee.end],
      argumentRanges: init.arguments.map((arg) => [arg.start, arg.end]),
    },
  });
}

export interface ResolvedSetupCall {
  binding: LocalId;
  name: string;
  contract: SetupCallContract | undefined;
  /** The marker name without `$` when the callee has `Qrl` and function twins. */
  stem: string | null;
}

export function resolveSetupCall(
  call: CallExpression,
  ctx: LowerContext
): ResolvedSetupCall | null {
  const binding = ctx.bindings.reference(call.callee);
  if (binding === null) {
    return null;
  }
  const imported = ctx.plan.imports.find((entry) => entry.binding === binding);
  const coreApi = ctx.coreBindings.get(binding);
  // `native$` is stripped at assembly, so its `$` must not read as a QRL boundary.
  if (
    coreApi === QwikMarker.Dollar ||
    coreApi === QwikMarker.Component ||
    coreApi === QwikMarker.Native
  ) {
    return null;
  }
  const name =
    coreApi ??
    (imported !== undefined && imported.imported !== 'default' && imported.imported !== '*'
      ? imported.imported
      : ctx.plan.bindings[binding].name);
  if (!/^use.+/.test(name) && !name.endsWith(QRL_SUFFIX) && !ctx.locals.has(binding)) {
    return null;
  }
  // Named `$` imports and exported `$` locals have twins by convention; other `$` bindings keep their call.
  // A core `$` export without a setup contract (`event$`) has its `Qrl` twin like any named import.
  const hasTwins =
    name.endsWith(QRL_SUFFIX) &&
    (coreApi !== undefined
      ? !coreSetupCalls.has(coreApi)
      : imported !== undefined
        ? imported.imported === name
        : // Under its OWN name, as the convention reads: a minified bundle exports mangled
          // locals (`e$` as `component$`) whose twins cannot exist.
          ctx.plan.exports.some(
            (entry) =>
              entry.e === ExportKind.Local &&
              entry.exported === name &&
              entry.target.t === ExportTargetKind.Binding &&
              entry.target.binding === binding
          ));
  return {
    binding,
    name,
    contract: coreApi === undefined ? undefined : coreSetupCalls.get(coreApi),
    stem: hasTwins ? name.slice(0, -QRL_SUFFIX.length) : null,
  };
}

export function lowerSetupCall(
  call: CallExpression,
  callee: NonNullable<ReturnType<typeof resolveSetupCall>>,
  pattern: BindingPattern | null,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  if (call.optional) {
    throw new UnsupportedError('an optional setup call');
  }
  const coreApi = ctx.coreBindings.get(callee.binding);
  if (coreApi === QwikHook.UseStyles || coreApi === QwikHook.UseStylesScoped) {
    return lowerStyleCall(call, coreApi === QwikHook.UseStylesScoped, pattern, ctx, locals);
  }
  const contract = pattern === null ? undefined : callee.contract;
  if (contract?.maxArgs !== undefined && call.arguments.length > contract.maxArgs) {
    throw new UnsupportedError(`${callee.name} with more than ${contract.maxArgs} arguments`);
  }
  const args = callee.name.endsWith(QRL_SUFFIX)
    ? lowerQrlHookArgs(call, identifierName(pattern) ?? callee.name, callee.name, ctx)
    : call.arguments.map((argument) => lowerHookArg(argument, ctx));
  const isVisibleTask = callee.contract?.operation === CoreOperation.VisibleTask;
  const localKind = ctx.locals.get(callee.binding)?.kind;
  // Custom hooks may wrap tasks, so they wait; core hooks wait only when their contract says so.
  const blocksInitialRender =
    coreApi === undefined
      ? (callee.stem !== null || /^use/.test(callee.name)) &&
        localKind !== LocalKind.PropMember &&
        localKind !== LocalKind.PropRest
      : callee.contract?.blocksRender === true;
  return {
    s: SetupKind.Call,
    target: lowerCallTarget(call.callee, callee, ctx),
    args,
    result:
      pattern === null ? null : lowerSetupBinding(pattern, ctx, locals, contract?.result).result,
    ...(isVisibleTask ? { visibleTaskEvent: visibleTaskEvent(call.arguments[1]) } : {}),
    ...(blocksInitialRender ? { blocksInitialRender: true as const } : {}),
    ...(coreApi === QwikHook.UseContextProvider ? { providesContext: true as const } : {}),
  };
}

/** Styles never become QRLs: both environments append the css under a compile-time id. */
function lowerStyleCall(
  call: CallExpression,
  scoped: boolean,
  pattern: BindingPattern | null,
  ctx: LowerContext,
  locals: SetupLocals
): Setup {
  const argument = call.arguments[0];
  const expression = argument?.type === 'SpreadElement' ? null : unwrapExpression(argument);
  if (expression === null || call.arguments.length !== 1) {
    throw new UnsupportedError('a style hook without exactly one css argument');
  }
  const ordinal = ctx.styleCounter.next++;
  let styleId = createStyleId(ctx.sourceIdentity, ordinal);
  const staticCss = scoped ? null : getStaticStyle(expression, ctx);
  const binding = ctx.bindings.reference(expression);
  const imported = ctx.plan.imports.find((entry) => entry.binding === binding);
  if (staticCss !== null) {
    styleId = createStyleId(`global-css\0${staticCss}`, 0);
  } else if (!scoped && imported !== undefined) {
    const specifier = ctx.plan.edges[imported.edge].specifier;
    if (specifier.startsWith('.')) {
      const separator = ctx.sourceIdentity.indexOf('\0');
      const sourcePath = ctx.sourceIdentity.slice(separator + 1);
      const identity = createSegmentSourceIdentity(
        sourcePath.slice(0, sourcePath.lastIndexOf('/') + 1) + specifier,
        ctx.sourceIdentity.slice(0, separator)
      );
      styleId = createStyleId(`${identity}\0${imported.imported}`, 0);
    }
  }
  if (scoped) {
    ctx.styleScopes.push(`⚡️${styleId}`);
  }
  const literal =
    expression.type === 'Literal' && typeof expression.value === 'string'
      ? expression.value
      : expression.type === 'TemplateLiteral' && expression.expressions.length === 0
        ? expression.quasis[0].value.cooked
        : null;
  return {
    s: SetupKind.Style,
    ordinal,
    styleId,
    scoped,
    css:
      literal === null || literal === undefined
        ? {
            dynamic: lowerExpressionPayload(
              expression,
              ctx,
              collectCaptures(expression, ctx, new Set())
            ),
          }
        : literal,
    result:
      pattern === null ? null : lowerSetupBinding(pattern, ctx, locals, LocalKind.Const).result,
  };
}

function getStaticStyle(expression: Expression, ctx: LowerContext): string | null {
  const visited = new Set<LocalId>();
  while (expression.type === 'Identifier') {
    const binding = ctx.bindings.reference(expression);
    if (
      binding === null ||
      visited.has(binding) ||
      ctx.plan.bindings[binding].varKind !== VarKind.Const
    ) {
      return null;
    }
    visited.add(binding);
    const declaration = ctx.bindings.declarationsOf(binding)[0];
    if (
      declaration?.type !== 'VariableDeclarator' ||
      declaration.id.type !== 'Identifier' ||
      declaration.init === null
    ) {
      return null;
    }
    const initial = unwrapExpression(declaration.init);
    if (initial === null) {
      return null;
    }
    expression = initial;
  }
  return expression.type === 'Literal' && typeof expression.value === 'string'
    ? expression.value
    : expression.type === 'TemplateLiteral' && expression.expressions.length === 0
      ? (expression.quasis[0].value.cooked ?? null)
      : null;
}

function visibleTaskEvent(options: Argument | undefined): VisibleTaskEvent {
  const object = options === undefined ? null : unwrapExpression(options);
  if (object === null) {
    return VisibleTaskEvent.Visible;
  }
  if (object.type !== 'ObjectExpression') {
    throw new UnsupportedError('a dynamic useVisibleTask$ options argument');
  }
  const strategy = object.properties.find(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      identifierName(property.key) === 'strategy'
  );
  if (strategy === undefined) {
    return VisibleTaskEvent.Visible;
  }
  const value = strategy.type === 'Property' ? unwrapExpression(strategy.value) : null;
  switch (value?.type === 'Literal' ? value.value : null) {
    case 'intersection-observer':
      return VisibleTaskEvent.Visible;
    case 'document-ready':
      return VisibleTaskEvent.Init;
    case 'document-idle':
      return VisibleTaskEvent.Idle;
    default:
      throw new UnsupportedError('a dynamic useVisibleTask$ strategy');
  }
}

function lowerCallTarget(
  expression: CallExpression['callee'],
  { binding, stem, contract }: NonNullable<ReturnType<typeof resolveSetupCall>>,
  ctx: LowerContext
): CallTarget {
  if (stem !== null) {
    return { kind: CallTargetKind.Marker, binding, stem };
  }
  if (contract !== undefined) {
    return { kind: CallTargetKind.Core, operation: contract.operation };
  }
  const value = tryLowerExprIr(expression, ctx);
  return value === null
    ? { kind: CallTargetKind.Binding, binding }
    : { kind: CallTargetKind.Value, value };
}

function lowerQrlHookArgs(
  call: CallExpression,
  name: string,
  calleeName: string,
  ctx: LowerContext
): [QrlArg, ...Arg[]] {
  const args: [QrlArg, ...Arg[]] = [lowerHookCallback(call, name, calleeName, ctx)];
  for (const argument of call.arguments.slice(1)) {
    args.push(lowerHookArg(argument, ctx));
  }
  return args;
}

function lowerHookArg(argument: Argument, ctx: LowerContext): Arg {
  const expression = argument.type === 'SpreadElement' ? argument.argument : argument;
  // Inline arguments retain module references and rewrite local aliases.
  const refs = collectCaptures(expression, ctx, new Set());
  const value = lowerInlineExpressionValue(expression, ctx, refs);
  return {
    a: argument.type === 'SpreadElement' ? ArgKind.Spread : ArgKind.Expr,
    expr: value.expr,
  };
}
