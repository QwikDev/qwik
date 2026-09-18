import type { BindingIdentifier, BindingPattern, Expression } from 'oxc-parser';

/** One step from the props object to a destructured leaf. */
export type PropPathStep =
  | { kind: 'member'; name: string }
  | { kind: 'index'; index: number }
  | { kind: 'computed'; key: Expression };

export interface ParameterMember {
  node: BindingIdentifier;
  /** The top-level prop the leaf hangs off, or '' behind a computed key. */
  name: string;
  path: PropPathStep[];
  defaultValue: Expression | null;
}

/** Leaves of a parameter pattern as prop paths; null for shapes that stay native destructuring. */
export function readObjectParameter(pattern: BindingPattern) {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  const members: ParameterMember[] = [];
  let rest: BindingIdentifier | null = null;
  const collect = (leaf: BindingPattern, path: PropPathStep[]): boolean => {
    const top = path[0];
    const name = top?.kind === 'member' ? top.name : '';
    switch (leaf.type) {
      case 'Identifier':
        members.push({ node: leaf, name, path, defaultValue: null });
        return true;
      case 'AssignmentPattern':
        if (leaf.left.type !== 'Identifier') {
          return false;
        }
        members.push({ node: leaf.left, name, path, defaultValue: leaf.right });
        return true;
      case 'ArrayPattern':
        return leaf.elements.every(
          (element, index) =>
            element === null ||
            (element.type !== 'RestElement' &&
              collect(element, [...path, { kind: 'index', index }]))
        );
      case 'ObjectPattern':
        return leaf.properties.every((property) => {
          if (property.type === 'RestElement') {
            if (path.length > 0 || property.argument.type !== 'Identifier') {
              return false;
            }
            rest = property.argument;
            return true;
          }
          const key = property.key;
          const step: PropPathStep | null =
            key.type === 'Literal' && typeof key.value === 'string'
              ? { kind: 'member', name: key.value }
              : !property.computed && key.type === 'Identifier'
                ? { kind: 'member', name: key.name }
                : property.computed && key.type !== 'PrivateIdentifier'
                  ? { kind: 'computed', key }
                  : null;
          return step !== null && collect(property.value, [...path, step]);
        });
      default:
        return false;
    }
  };
  if (!collect(pattern, [])) {
    return null;
  }
  // A rest cannot exclude a key it cannot name.
  if (rest !== null && members.some((member) => member.path[0]?.kind === 'computed')) {
    return null;
  }
  return { members, rest };
}
