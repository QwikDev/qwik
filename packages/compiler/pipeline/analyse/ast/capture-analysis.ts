import type { Node } from 'oxc-parser';
import {
  ArgPass,
  CaptureAccess,
  type LocalId,
  type Qrl,
  type QrlUse,
  type Range,
} from '../../schema';
import { UnsupportedError } from '../../errors';
import { isNode, type WalkableNode } from './ast-types';
import type { LowerContext } from '../lower-context';
import type { SetupLocal } from '../lower-setup';

export interface CollectedCaptures {
  props: boolean;
  /** Reactive setup locals the boundary captures, in first-read order. */
  locals: { name: string; local: SetupLocal; reads: Range[] }[];
  /** A referenced binding no capture mechanism covers yet. */
  other: string | null;
}

/**
 * Outer bindings a boundary references: the props param and reactive setup locals are capturable;
 * anything else would emit a chunk referencing names absent from the chunk module — refuse.
 */
export function collectCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  localBindings: ReadonlySet<LocalId>
): CollectedCaptures {
  let props = false;
  const locals: CollectedCaptures['locals'] = [];
  let other: string | null = null;
  const visit = (current: unknown): void => {
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item);
      }
      return;
    }
    if (!isNode(current) || other !== null) {
      return;
    }
    if (current.type === 'Identifier') {
      const binding = ctx.bindings.reference(current);
      if (binding === null || localBindings.has(binding) || isDeclaredWithin(ctx, binding, node)) {
        return;
      }
      const setupLocal = ctx.locals.get(binding);
      if (binding === ctx.propsBinding) {
        props = true;
      } else if (setupLocal !== undefined) {
        const read: Range = [current.start, current.end];
        const entry = locals.find((candidate) => candidate.local === setupLocal);
        if (entry === undefined) {
          locals.push({ name: current.name, local: setupLocal, reads: [read] });
        } else {
          entry.reads.push(read);
        }
      } else {
        other = ctx.plan.bindings[binding].name;
      }
      return;
    }
    for (const childKey of Object.keys(current)) {
      if (
        childKey === 'type' ||
        childKey === 'start' ||
        childKey === 'end' ||
        childKey === 'range' ||
        childKey === 'parent'
      ) {
        continue;
      }
      visit((current as WalkableNode)[childKey]);
    }
  };
  visit(node);
  return { props, locals, other };
}

function isDeclaredWithin(ctx: LowerContext, binding: LocalId, node: Node | Node[]): boolean {
  const range = ctx.plan.bindings[binding].declarationRange;
  const roots = Array.isArray(node) ? node : [node];
  return range !== null && roots.some((root) => range[0] >= root.start && range[1] <= root.end);
}

export interface LoweredCaptures {
  captures: Qrl['captures'];
  args: QrlUse['args'];
  refs: CollectedCaptures;
}

/**
 * The one capture policy: setup locals ride as Direct captures (Binding args), the props param —
 * when the boundary supports it — as a trailing ComponentProp capture (Props arg); anything else
 * refuses as `<subject> capturing "name"`.
 */
export function lowerCaptures(
  node: Node | Node[],
  ctx: LowerContext,
  /** Refusal-message subject, e.g. 'a branch arm'. */
  subject: string,
  options: { localBindings?: ReadonlySet<LocalId>; allowProps?: boolean } = {}
): LoweredCaptures {
  const refs = collectCaptures(node, ctx, options.localBindings ?? new Set());
  if (refs.other !== null) {
    throw new UnsupportedError(`${subject} capturing "${refs.other}"`);
  }
  if (refs.props && options.allowProps !== true) {
    throw new UnsupportedError(
      `${subject} capturing "${ctx.plan.bindings[ctx.propsBinding!].name}"`
    );
  }
  const captures: Qrl['captures'] = [];
  const args: QrlUse['args'] = [];
  for (const entry of refs.locals) {
    // Aliases of one destructured param share a binding — the container captures once.
    if (captures.some((capture) => capture.binding === entry.local.binding)) {
      continue;
    }
    captures.push({ binding: entry.local.binding, access: entry.local.access });
    args.push({ pass: ArgPass.Binding, binding: entry.local.binding });
  }
  if (refs.props) {
    captures.push({ binding: ctx.propsBinding!, access: CaptureAccess.ComponentProp });
    args.push({ pass: ArgPass.Props });
  }
  return { captures, args, refs };
}
