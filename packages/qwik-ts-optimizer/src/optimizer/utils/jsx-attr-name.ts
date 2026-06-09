/**
 * Canonical JSX attribute-name extraction.
 *
 * A `JSXAttribute`'s name is either a plain `JSXIdentifier` (`onClick`) or a
 * `JSXNamespacedName` (`bind:value`, `document:onScroll`). The optimizer keys
 * event-handler, passive-directive, and bind/QRL logic on the flattened
 * `namespace:name` string, so this collapse recurs across extraction, parent
 * rewrite, and JSX codegen. This is its single source of truth.
 *
 * Total over the `JSXAttributeName` union: `JSXAttribute.name` is non-optional
 * and the union has exactly two arms, so a well-formed attribute always yields
 * a non-empty string — no nullable return.
 */

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
      throw new Error(
        `unhandled JSX attribute name type: ${(name as { type?: string }).type}`,
      );
    }
  }
}
