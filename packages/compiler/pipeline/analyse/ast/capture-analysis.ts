import type { Node } from 'oxc-parser';
import { isNode, type WalkableNode } from './ast-types';
import type { LowerContext } from '../lower-context';
import type { SetupLocal } from '../lower-setup';

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
