import type { Node } from 'oxc-parser';
import { ArgPass, CaptureAccess, type Qrl, type QrlUse } from '../../schema';
import { UnsupportedError } from '../../errors';
import { isNode, type WalkableNode } from './ast-types';
import type { LowerContext } from '../lower-context';
import { LocalKind, type SetupLocal } from '../lower-setup';

export interface CollectedCaptures {
  props: boolean;
  /** Reactive setup locals the boundary captures, in first-read order. */
  locals: { name: string; local: SetupLocal }[];
  /** A referenced binding no capture mechanism covers yet. */
  other: string | null;
}

/**
 * Outer bindings a boundary references: the props param and reactive setup locals are capturable;
 * anything else would emit a chunk referencing names absent from the chunk module — refuse.
 */
export function collectCaptures(
  node: Node,
  ctx: LowerContext,
  localNames: ReadonlySet<string>
): CollectedCaptures {
  let props = false;
  const locals: CollectedCaptures['locals'] = [];
  let other: string | null = null;
  const visit = (current: unknown, parent: Node | null, key: string | null): void => {
    if (Array.isArray(current)) {
      for (const item of current) {
        visit(item, parent, key);
      }
      return;
    }
    if (!isNode(current) || other !== null) {
      return;
    }
    if (current.type === 'Identifier') {
      const isMemberProperty =
        parent?.type === 'MemberExpression' && key === 'property' && parent.computed !== true;
      const isPropertyKey =
        parent?.type === 'Property' && key === 'key' && parent.computed !== true;
      if (!isMemberProperty && !isPropertyKey) {
        const name = current.name;
        if (!localNames.has(name)) {
          const setupLocal = ctx.locals.get(name);
          if (name === ctx.propsParamName) {
            props = true;
          } else if (setupLocal !== undefined) {
            if (!locals.some((entry) => entry.name === name)) {
              locals.push({ name, local: setupLocal });
            }
          } else if (ctx.bindingNames.has(name)) {
            other = name;
          }
        }
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
      visit((current as WalkableNode)[childKey], current, childKey);
    }
  };
  visit(node, null, null);
  return { props, locals, other };
}

export interface LoweredCaptures {
  captures: Qrl['captures'];
  args: QrlUse['args'];
}

/**
 * The one capture policy: setup locals ride as Direct captures (Binding args), the props param —
 * when the boundary supports it — as a trailing ComponentProp capture (Props arg); anything else
 * refuses as `<subject> capturing "name"`.
 */
export function lowerCaptures(
  node: Node,
  ctx: LowerContext,
  /** Refusal-message subject, e.g. 'a branch arm'. */
  subject: string,
  options: { localNames?: ReadonlySet<string>; allowProps?: boolean } = {}
): LoweredCaptures {
  const refs = collectCaptures(node, ctx, options.localNames ?? new Set());
  if (refs.other !== null) {
    throw new UnsupportedError(`${subject} capturing "${refs.other}"`);
  }
  if (refs.props && options.allowProps !== true) {
    throw new UnsupportedError(`${subject} capturing "${ctx.propsParamName}"`);
  }
  const captures: Qrl['captures'] = refs.locals.map((entry) => ({
    binding: entry.local.binding,
    access:
      entry.local.kind === LocalKind.LoopValue ? CaptureAccess.LoopValue : CaptureAccess.Direct,
  }));
  const args: QrlUse['args'] = refs.locals.map((entry) => ({
    pass: ArgPass.Binding,
    binding: entry.local.binding,
  }));
  if (refs.props) {
    const binding = ctx.plan.bindings.findIndex((entry) => entry.name === ctx.propsParamName);
    captures.push({ binding, access: CaptureAccess.ComponentProp });
    args.push({ pass: ArgPass.Props });
  }
  return { captures, args };
}
