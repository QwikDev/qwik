/**
 * Shared binding-pattern helpers for ESTree-compatible AST nodes.
 */

import type {
  BindingPattern,
  BindingRestElement,
  FormalParameterRest,
  TSParameterProperty,
} from '@oxc-project/types';

/**
 * The closed union of node types `visitBindingNames` dispatches on.
 *
 * OXC's canonical `BindingPattern` covers identifier-in-binding-position,
 * object pattern, array pattern, and assignment pattern. We extend with
 * `BindingRestElement` / `FormalParameterRest` (both `type: "RestElement"`
 * at runtime; appear in array-pattern element slots and function-param
 * rest slots respectively) and `TSParameterProperty` (TS class constructor
 * param shorthand). The switch in `visitBindingNames` exhausts this union;
 * adding a new variant upstream forces a compile-time update.
 */
export type BindingPatternLike =
  | BindingPattern
  | BindingRestElement
  | FormalParameterRest
  | TSParameterProperty;

function visitBindingNames(
  node: BindingPatternLike | null | undefined,
  visit: (name: string) => void,
): void {
  if (!node) return;

  switch (node.type) {
    case 'Identifier':
      visit(node.name);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        const target = prop.type === 'RestElement' ? prop.argument : prop.value;
        visitBindingNames(target, visit);
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        visitBindingNames(elem, visit);
      }
      break;

    case 'RestElement':
      visitBindingNames(node.argument, visit);
      break;

    case 'AssignmentPattern':
      visitBindingNames(node.left, visit);
      break;

    case 'TSParameterProperty':
      visitBindingNames(node.parameter, visit);
      break;

    default: {
      const _exhaustive: never = node;
      throw new Error(`unhandled binding-pattern node: ${(_exhaustive as { type?: string }).type}`);
    }
  }
}

/** Collect all declared binding names from a pattern node. */
export function collectBindingNamesFromPattern(
  pattern: BindingPatternLike | null | undefined,
): string[] {
  const names: string[] = [];
  visitBindingNames(pattern, (name) => names.push(name));
  return names;
}

/** Add all binding names from a pattern node into an existing array. */
export function appendBindingNamesFromPattern(
  pattern: BindingPatternLike | null | undefined,
  target: string[],
): void {
  visitBindingNames(pattern, (name) => target.push(name));
}

/** Add all binding names from a pattern node into an existing set. */
export function addBindingNamesFromPatternToSet(
  pattern: BindingPatternLike | null | undefined,
  target: Set<string>,
): void {
  visitBindingNames(pattern, (name) => target.add(name));
}
