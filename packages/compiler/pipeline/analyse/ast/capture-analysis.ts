import type { Node } from 'oxc-parser';
import {
  ArgPass,
  CaptureAccess,
  BindingScope,
  type LocalId,
  type Qrl,
  type QrlUse,
  type Range,
  type Payload,
} from '../../schema';
import { UnsupportedError } from '../../errors';
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
}

/** Module references retain identity; supported setup bindings become captures. */
export function collectCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>
): CollectedCaptures {
  const propsReads: Range[] = [];
  const locals: CollectedCaptures['locals'] = [];
  const moduleReads: Payload['reads'] = [];
  let other: string | null = null;
  let capturedWrite: CollectedCaptures['capturedWrite'] = null;
  for (const { node: current, binding, role, isWrite } of ctx.bindings.freeReferences(node)) {
    if (
      current.type === 'JSXIdentifier' &&
      ctx.locals.has(binding) &&
      !localBindings.has(binding)
    ) {
      other ??= current.name;
      continue;
    }
    if (current.type !== 'Identifier' || localBindings.has(binding)) {
      continue;
    }
    const setupLocal = ctx.locals.get(binding);
    if (isWrite && (setupLocal !== undefined || binding === ctx.propsBinding)) {
      capturedWrite ??= { name: current.name, range: [current.start, current.end] };
    }
    if (binding === ctx.propsBinding) {
      propsReads.push([current.start, current.end]);
    } else if (setupLocal !== undefined) {
      const read = { range: [current.start, current.end] as Range, role };
      const entry = locals.find((candidate) => candidate.local === setupLocal);
      if (entry === undefined) {
        locals.push({ name: current.name, local: setupLocal, reads: [read] });
      } else {
        entry.reads.push(read);
      }
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
  return { propsReads, locals, moduleReads, other, capturedWrite };
}

export interface LoweredCaptures {
  captures: Qrl['captures'];
  args: QrlUse['args'];
  refs: CollectedCaptures;
}

/** Captures share one ABI: setup locals first, component props last. */
export function lowerCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  /** Refusal-message subject, e.g. 'a branch arm'. */
  subject: string,
  localBindings: ReadonlySet<LocalId> = new Set()
): LoweredCaptures {
  const refs = collectCaptures(node, ctx, localBindings);
  if (refs.other !== null) {
    throw new UnsupportedError(`${subject} capturing "${refs.other}"`);
  }
  const captures: Qrl['captures'] = [];
  const args: QrlUse['args'] = [];
  const addCapture = (binding: LocalId, access: CaptureAccess) => {
    if (!captures.some((capture) => capture.binding === binding)) {
      captures.push({ binding, access });
      args.push({ pass: ArgPass.Binding, binding });
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
  if (refs.propsReads.length > 0) {
    captures.push({ binding: ctx.propsBinding!, access: CaptureAccess.ComponentProp });
    args.push({ pass: ArgPass.Props });
  }
  return { captures, args, refs };
}
