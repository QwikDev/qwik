import type { JSXAttribute } from '../../ast-types.js';

export function getJsxAttributeName(attr: JSXAttribute): string {
  const name = attr.name;
  switch (name.type) {
    case 'JSXIdentifier':
      return name.name;
    case 'JSXNamespacedName':
      return `${name.namespace.name}:${name.name.name}`;
    default: {
      const _exhaustive: never = name;
      throw new Error(`unhandled JSX attribute name type: ${(name as { type?: string }).type}`);
    }
  }
}
