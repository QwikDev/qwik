import type { AstNode } from './ast-types';
import { isNode } from './ast-types';
import type { LowerContext } from '../lower-context';
import type { SetupLocal } from '../lower-setup';

export interface OuterRefs {
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
export function collectOuterRefs(
  node: AstNode,
  ctx: LowerContext,
  localNames: ReadonlySet<string>
): OuterRefs {
  let props = false;
  const locals: OuterRefs['locals'] = [];
  let other: string | null = null;
  const visit = (current: unknown, parent: AstNode | null, key: string | null): void => {
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
        const name = String((current as AstNode & { name: string }).name);
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
        childKey === 'range'
      ) {
        continue;
      }
      visit(current[childKey], current, childKey);
    }
  };
  visit(node, null, null);
  return { props, locals, other };
}
