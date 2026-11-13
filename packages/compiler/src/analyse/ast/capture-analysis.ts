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
import { liftedLocal, type FunctionRebind, type LowerContext } from '../lower-context';
import { LocalKind, type SetupLocal } from '../locals';
import { collectIrBindingIds } from '../../schema/value-ir';
import { isComponentDeclaration, isHeuristicComponent } from './returns-jsx';
import { isFunctionLike, unwrapExpression } from './utils';

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
  /** Lifted locals the node's own code reads, so its prelude rebinds them. */
  functions: FunctionRebind[];
  /** A called function reads props, so the boundary must capture them too. */
  propsRequired: boolean;
}

/** Module references retain identity; supported setup bindings become captures. */
export function collectCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>,
  /** A boundary rebinds the lifted locals it reads; an inline read leaves them to its scope. */
  lift = false,
  /** The boundary's own code, when part of `node` lowers to segments of its own. */
  own: Node | Node[] = node
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
  const spliced = new Set<LocalId>();
  // A lifted local is never a value: the boundary captures what its segment captures, wherever the
  // read sits, and rebinds it only where its own code reads it.
  const addLifted = (reference: Node, binding: LocalId) => {
    const rebind = liftedLocal(ctx, binding);
    if (ctx.lifts.isOwnRead(reference, own)) {
      ctx.claimedReads.add(reference);
      if (!functions.includes(rebind)) {
        functions.push(rebind);
      }
    }
    if (spliced.has(binding)) {
      return;
    }
    spliced.add(binding);
    for (const captured of liveReferences(ctx.lifts.liftables.get(binding)!.fn, ctx)) {
      const local = ctx.locals.get(captured.binding);
      if (ctx.lifts.isLifted(captured.binding)) {
        addLifted(captured.node, captured.binding);
      } else if (captured.binding === ctx.propsBinding) {
        propsRequired = true;
      } else if (local !== undefined) {
        addLocal(ctx.plan.bindings[captured.binding].name, local);
      } else if (ctx.bindings.implicitKind(captured.binding) !== null) {
        // The rebind is bound where the local is declared; a boundary has no such `this`.
        const read = captured.node.type === 'ThisExpression' ? 'this' : captured.node.name;
        const local = `the local ${liftableKind(binding, ctx)} "${ctx.plan.bindings[binding].name}"`;
        throw new UnsupportedError(`a boundary reading ${local}, which reads "${read}"`);
      }
    }
  };
  const references = liveReferences(node, ctx);
  // A function declaration declares its own name, so its recursive calls are not free in it.
  const fn = !Array.isArray(node) && node.type === 'FunctionDeclaration' ? node : null;
  const self = lift && fn !== null ? ctx.bindings.declaration(fn.id!) : null;
  if (self !== null && ctx.lifts.isLifted(self)) {
    const selfReads = ctx.bindings
      .referencesOf(self)
      .filter(({ node: reference }) => fn!.start <= reference.start && reference.end <= fn!.end);
    // A function segment keeps the authored head, whose name reaches itself; a component's does not.
    if (ctx.lifts.liftables.get(self)!.component === null) {
      selfReads.forEach(({ node }) => ctx.claimedReads.add(node));
    } else {
      references.push(...selfReads);
    }
  }
  for (const { node: current, binding, role, isWrite } of references) {
    if (lift && ctx.lifts.isLifted(binding)) {
      addLifted(current, binding);
      continue;
    }
    const unliftable = lift ? unliftableFunction(binding, ctx) : null;
    if (unliftable !== null) {
      throw new UnsupportedError(`a boundary reading ${unliftable}`);
    }
    // A boundary the analysis does not see, such as a key copying row constants, cannot rebind it.
    if (lift && ctx.lifts.liftables.has(binding)) {
      other ??= ctx.plan.bindings[binding].name;
      continue;
    }
    // A module component tag is a reference, not a capture; a body one lifts to its own segment.
    const isTag =
      current.type === 'JSXIdentifier' &&
      ctx.bindings.parentOf(current)?.type !== 'JSXMemberExpression';
    if (isTag && !ctx.locals.has(binding)) {
      continue;
    }
    if (localBindings.has(binding)) {
      continue;
    }
    const name = current.type === 'ThisExpression' ? 'this' : current.name;
    const setupLocal =
      ctx.locals.get(binding) ??
      (ctx.bindings.implicitKind(binding) === null
        ? undefined
        : {
            kind: LocalKind.Const,
            access: CaptureAccess.Direct,
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
      // reads and writes both reach the one declaration through the module's alias export
      ctx.plan.bindings[binding].scope === BindingScope.Module ||
      (!isWrite &&
        ctx.plan.bindings[binding].scope === BindingScope.Import &&
        ctx.plan.imports.some((entry) => entry.binding === binding && !entry.typeOnly))
    ) {
      moduleReads.push({ range: [current.start, current.end], binding, role });
    } else {
      other ??= ctx.plan.bindings[binding].name;
    }
  }
  return { propsReads, locals, moduleReads, other, capturedWrite, functions, propsRequired };
}

/** Free references in code lowering emits. */
function liveReferences(node: Node | Node[], ctx: LowerContext) {
  return ctx.bindings.freeReferences(node).filter(({ node }) => !ctx.lifts.isDropped(node));
}

/**
 * How the author wrote a local holding a local function no segment can hold: reassigned, declared
 * twice, or an alias of one. Null for any other binding.
 */
function unliftableFunction(binding: LocalId, ctx: LowerContext): string | null {
  const { scope, name } = ctx.plan.bindings[binding];
  if (
    scope === BindingScope.Module ||
    scope === BindingScope.Import ||
    ctx.lifts.liftables.has(binding)
  ) {
    return null;
  }
  const declarations = ctx.bindings.declarationsOf(binding);
  const values = [
    ...declarations.filter(({ type }) => type === 'FunctionDeclaration'),
    ...ctx.bindings.assignedValuesOf(binding),
  ].map((value) => unwrapExpression(value)!);
  const isWritten = ctx.bindings.referencesOf(binding).some(({ isWrite }) => isWrite);
  if (!isWritten && declarations.length === 1) {
    const target = values.length === 1 ? aliasedLiftable(values[0], ctx) : null;
    return target === null
      ? null
      : `"${name}", an alias of the local ${liftableKind(target, ctx)} "${ctx.plan.bindings[target].name}"`;
  }
  const isComponent = (value: Node) =>
    isComponentDeclaration(value, ctx.bindings, ctx.coreBindings) ||
    isHeuristicComponent(value, binding, ctx.jsx, ctx.bindings);
  const isFunction = (value: Node) => isFunctionLike(value) || aliasedLiftable(value, ctx) !== null;
  if (values.length === 0 || !values.every((value) => isFunction(value) || isComponent(value))) {
    return null;
  }
  const kind = values.some(isComponent) ? 'component' : 'function';
  return isWritten
    ? `the reassigned local ${kind} "${name}"`
    : `the local ${kind} "${name}" declared twice`;
}

/** The liftable `value` may name: `f`, `c ? A : B`, `a ?? f`. */
function aliasedLiftable(value: Node, ctx: LowerContext): LocalId | null {
  const node = unwrapExpression(value)!;
  if (node.type === 'ConditionalExpression') {
    return aliasedLiftable(node.consequent, ctx) ?? aliasedLiftable(node.alternate, ctx);
  }
  if (node.type === 'LogicalExpression') {
    return aliasedLiftable(node.left, ctx) ?? aliasedLiftable(node.right, ctx);
  }
  const binding = node.type === 'Identifier' ? ctx.bindings.reference(node) : null;
  return binding !== null && ctx.lifts.liftables.has(binding) ? binding : null;
}

function liftableKind(binding: LocalId, ctx: LowerContext): string {
  return ctx.lifts.liftables.get(binding)!.component === null ? 'function' : 'component';
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
  {
    lift = true,
    ownsHooks = !lift,
    own = node,
  }: {
    lift?: boolean;
    /** A lifted component body is its own setup, so its hooks have an owner. */
    ownsHooks?: boolean;
    own?: Node | Node[];
  } = {}
): LoweredCaptures {
  const refs = collectCaptures(node, ctx, localBindings, lift, own);
  // A lifted body runs outside setup, where a hook has no component owner. `useId` is a plain
  // counter read and a `$` hook is a marker call the compiler rewrites wherever it appears.
  // A nested segment (a lifted component's setup) checks its own hooks.
  const hookCall = !ownsHooks
    ? ctx.bindings
        .freeReferences(node)
        .find(
          ({ node, role }) =>
            role === ReadRole.Call &&
            node.type === 'Identifier' &&
            /^use[A-Z]/.test(node.name) &&
            node.name !== 'useId' &&
            !node.name.endsWith(QRL_SUFFIX) &&
            ctx.lifts.isOwnRead(node, own)
        )
    : undefined;
  if (hookCall !== undefined) {
    const { name, start, end } = hookCall.node as Extract<typeof hookCall.node, { name: string }>;
    throw new InvalidModuleError(
      'expression-hook',
      `${name}() cannot run inside ${subject}; call it in the component body (const value = ${name}(…)) and use the result here.`,
      [start, end]
    );
  }
  if (refs.other !== null) {
    throw new UnsupportedError(`${subject} capturing "${refs.other}"`);
  }
  const captures: Qrl['captures'] = [];
  const args: QrlUse['args'] = [];
  const addCapture = (binding: LocalId, access: CaptureAccess) => {
    if (lift && ctx.lifts.liftables.has(binding)) {
      const { name } = ctx.plan.bindings[binding];
      throw new Error(`pipeline: the local function "${name}" in a capture list`);
    }
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
        binding,
      });
    }
  }
  return { ...ctx, locals };
}
