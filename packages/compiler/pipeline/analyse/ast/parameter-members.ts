import type { BindingIdentifier, BindingPattern } from 'oxc-parser';

/** Simple fields can remain live reads instead of eager destructuring. */
export function readParameterMembers(pattern: BindingPattern) {
  if (pattern.type !== 'ObjectPattern') {
    return null;
  }
  const members: { node: BindingIdentifier; name: string }[] = [];
  for (const property of pattern.properties) {
    if (property.type !== 'Property' || property.computed || property.value.type !== 'Identifier') {
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
    members.push({ node: property.value, name });
  }
  return members;
}
