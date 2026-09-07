import type { BindingIdentifier, BindingPattern, Expression } from 'oxc-parser';

/** Simple fields can remain live reads instead of eager destructuring. */
export function readObjectParameter(pattern: BindingPattern) {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  const members: { node: BindingIdentifier; name: string; defaultValue: Expression | null }[] = [];
  let rest: BindingIdentifier | null = null;
  for (const property of pattern.properties) {
    if (property.type === 'RestElement') {
      if (property.argument.type !== 'Identifier') {
        return null;
      }
      rest = property.argument;
      continue;
    }
    if (property.type !== 'Property' || property.computed) {
      return null;
    }
    const pattern = property.value;
    const binding = pattern.type === 'AssignmentPattern' ? pattern.left : pattern;
    if (binding.type !== 'Identifier') {
      return null;
    }
    const name =
      property.key.type === 'Identifier'
        ? property.key.name
        : property.key.type === 'Literal' && typeof property.key.value === 'string'
          ? property.key.value
          : null;
    if (name === null) {
      return null;
    }
    members.push({
      node: binding,
      name,
      defaultValue: pattern.type === 'AssignmentPattern' ? pattern.right : null,
    });
  }
  return { members, rest };
}
