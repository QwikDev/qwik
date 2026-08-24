import type { AstNode } from './ast-types';
import { isNode } from './ast-types';
import type { LowerContext } from '../lower-context';

/**
 * Outer bindings a boundary references: the component's props param is capturable; anything else
 * would emit a chunk referencing names absent from the chunk module — refuse until captures land.
 */
export function collectOuterRefs(
  node: AstNode,
  ctx: LowerContext,
  localNames: ReadonlySet<string>
): { props: boolean; other: string | null } {
  let props = false;
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
          if (name === ctx.propsParamName) {
            props = true;
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
  return { props, other };
}
