import type { Node } from 'oxc-parser';
import { ImplicitBindingKind } from './bindings';
import {
  ArgPass,
  CaptureAccess,
  BindingScope,
  ReadRole,
  type LocalId,
  type Qrl,
  type QrlUse,
  type Range,
  type Payload,
} from '../../schema';
import { InvalidModuleError, UnsupportedError } from '../../errors';
import { QRL_SUFFIX } from '../../words';
import type { LowerContext } from '../lower-context';
import { LocalKind, type SetupLocal } from '../locals';
import { collectIrBindingIds } from '../../../src/expr-ir';

export interface CollectedCaptures {
  capturedWrite: { name: string; range: Range } | null;
  propsReads: Range[];
  moduleReads: Payload['reads'];
  /** Reactive setup locals the boundary captures, in first-read order. */
  locals: {
    name: string;
    local: SetupLocal;
    reads: Pick<Payload['reads'][number], 'range' | 'role'>[];
  }[];
  /** A referenced binding no capture mechanism covers yet. */
  other: string | null;
  /** Lifted body functions the node calls; their own captures are merged into `locals`. */
  functions: { binding: LocalId; use: QrlUse }[];
  /** A called function reads props, so the boundary must capture them too. */
  propsRequired: boolean;
}

/** Module references retain identity; supported setup bindings become captures. */
export function collectCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>,
  /** A boundary lifts the body functions it calls; an inline read leaves them authored. */
  lift = false
): CollectedCaptures {
  const propsReads: Range[] = [];
  const locals: CollectedCaptures['locals'] = [];
  const moduleReads: Payload['reads'] = [];
  let other: string | null = null;
  let capturedWrite: CollectedCaptures['capturedWrite'] = null;
  const functions: CollectedCaptures['functions'] = [];
  let propsRequired = false;
  const addLocal = (
    name: string,
    local: SetupLocal,
    read?: (typeof locals)[number]['reads'][number]
  ) => {
    const entry = locals.find((candidate) => candidate.local === local);
    if (entry === undefined) {
      locals.push({ name, local, reads: read === undefined ? [] : [read] });
    } else if (read !== undefined) {
      entry.reads.push(read);
    }
  };
  // A lifted function is never a value: the caller captures what it captures and rebinds it.
  const addFunction = (name: string, local: Extract<SetupLocal, { kind: LocalKind.Function }>) => {
    if (functions.some((entry) => entry.binding === local.binding)) {
      return;
    }
    const use = local.lift();
    functions.push({ binding: local.binding, use });
    for (const arg of use.args) {
      if (arg.pass === ArgPass.Props) {
        propsRequired = true;
      } else if (arg.pass === ArgPass.Binding) {
        const captured = ctx.locals.get(arg.binding)!;
        addLocal(ctx.plan.bindings[arg.binding].name, captured);
      }
    }
  };
  for (const { node: current, binding, role, isWrite } of ctx.bindings.freeReferences(node)) {
    // A module component tag is a reference and a local value alias is captured, but a function
    // declared in the body has no QRL to serialize as.
    const isTag =
      current.type === 'JSXIdentifier' &&
      ctx.bindings.parentOf(current)?.type !== 'JSXMemberExpression';
    if (isTag && !ctx.locals.has(binding)) {
      continue;
    }
    if (isTag && !localBindings.has(binding) && declaresFunction(ctx, binding)) {
      other ??= current.name;
      continue;
    }
    if (localBindings.has(binding)) {
      continue;
    }
    const name = current.type === 'ThisExpression' ? 'this' : current.name;
    const local = ctx.locals.get(binding);
    if (local?.kind === LocalKind.Function && lift && !isWrite) {
      addFunction(name, local);
      continue;
    }
    const setupLocal =
      ctx.locals.get(binding) ??
      (ctx.bindings.implicitKind(binding) === null
        ? undefined
        : {
            kind: LocalKind.Const,
            access: CaptureAccess.Direct,
            slot: -1,
            binding,
          });
    if (isWrite && (setupLocal !== undefined || binding === ctx.propsBinding)) {
      capturedWrite ??= { name, range: [current.start, current.end] };
    }
    if (binding === ctx.propsBinding) {
      propsReads.push([current.start, current.end]);
    } else if (setupLocal !== undefined) {
      addLocal(name, setupLocal, { range: [current.start, current.end] as Range, role });
    } else if (
      !isWrite &&
      (ctx.plan.bindings[binding].scope === BindingScope.Module ||
        (ctx.plan.bindings[binding].scope === BindingScope.Import &&
          ctx.plan.imports.some((entry) => entry.binding === binding && !entry.typeOnly)))
    ) {
      moduleReads.push({ range: [current.start, current.end], binding, role });
    } else {
      other ??= ctx.plan.bindings[binding].name;
    }
  }
  return { propsReads, locals, moduleReads, other, capturedWrite, functions, propsRequired };
}

function declaresFunction(ctx: LowerContext, binding: LocalId): boolean {
  return ctx.bindings.declarationsOf(binding).some((node) => {
    const value = node.type === 'VariableDeclarator' ? node.init : node;
    return (
      value?.type === 'FunctionDeclaration' ||
      value?.type === 'ArrowFunctionExpression' ||
      value?.type === 'FunctionExpression'
    );
  });
}

export interface LoweredCaptures {
  captures: Qrl['captures'];
  functions: Qrl['functions'];
  args: QrlUse['args'];
  refs: CollectedCaptures;
}

/** Captures share one ABI: setup locals first, component props last. */
export function lowerCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  /** Refusal-message subject, e.g. 'a branch arm'. */
  subject: string,
  localBindings: ReadonlySet<LocalId> = new Set(),
  lift = true
): LoweredCaptures {
  const refs = collectCaptures(node, ctx, localBindings, lift);
  // A lifted body runs outside setup, where a hook has no component owner. `useId` is a plain
  // counter read and a `$` hook is a marker call the compiler rewrites wherever it appears.
  const hookCall = lift
    ? ctx.bindings
        .freeReferences(node)
        .find(
          ({ node, role }) =>
            role === ReadRole.Call &&
            node.type === 'Identifier' &&
            /^use[A-Z]/.test(node.name) &&
            node.name !== 'useId' &&
            !node.name.endsWith(QRL_SUFFIX)
        )
    : undefined;
  if (hookCall !== undefined) {
    const { name, start, end } = hookCall.node as Extract<typeof hookCall.node, { name: string }>;
    throw new InvalidModuleError(
      'expression-hook',
      `${name}() cannot run inside ${subject}; hooks belong to the component body.`,
      [start, end]
    );
  }
  if (refs.other !== null) {
    throw new UnsupportedError(`${subject} capturing "${refs.other}"`);
  }
  const captures: Qrl['captures'] = [];
  const args: QrlUse['args'] = [];
  const addCapture = (binding: LocalId, access: CaptureAccess) => {
    if (!captures.some((capture) => capture.binding === binding)) {
      const implicit = ctx.bindings.implicitKind(binding);
      const isCaptured = ctx.locals.has(binding);
      captures.push({
        binding,
        access: implicit === ImplicitBindingKind.Arguments ? CaptureAccess.Arguments : access,
      });
      if (implicit === ImplicitBindingKind.Arguments) {
        args.push({ pass: ArgPass.Arguments, binding: isCaptured ? binding : null });
      } else {
        args.push(
          implicit === ImplicitBindingKind.This && !isCaptured
            ? { pass: ArgPass.This }
            : { pass: ArgPass.Binding, binding }
        );
      }
    }
  };
  for (const entry of refs.locals) {
    addCapture(entry.local.binding, entry.local.access);
    if (entry.local.kind === LocalKind.PropMember && entry.local.defaultValue !== undefined) {
      const defaults = new Set<LocalId>();
      collectIrBindingIds(entry.local.defaultValue, defaults);
      for (const binding of defaults) {
        addCapture(binding, CaptureAccess.Direct);
      }
    }
  }
  if (refs.propsReads.length > 0 || refs.propsRequired) {
    captures.push({ binding: ctx.propsBinding!, access: CaptureAccess.ComponentProp });
    args.push({ pass: ArgPass.Props });
  }
  return { captures, functions: refs.functions, args, refs };
}

/** Extracted scopes read captured aliases instead of native function context. */
export function createCapturedContext(ctx: LowerContext, captures: Qrl['captures']): LowerContext {
  if (!captures.some(({ binding }) => ctx.bindings.implicitKind(binding) !== null)) {
    return ctx;
  }
  const locals = new Map(ctx.locals);
  for (const { binding } of captures) {
    if (ctx.bindings.implicitKind(binding) !== null) {
      locals.set(binding, {
        kind: LocalKind.Const,
        access: CaptureAccess.Direct,
        slot: -1,
        binding,
      });
    }
  }
  return { ...ctx, locals };
}
