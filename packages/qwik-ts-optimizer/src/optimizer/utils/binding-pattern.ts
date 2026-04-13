/**
 * Shared binding-pattern helpers for ESTree-compatible AST nodes.
 */

import type { AstMaybeNode } from '../../ast-types.js';

function visitBindingNames(node: AstMaybeNode, visit: (name: string) => void): void {
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
  }
}

/** Collect all declared binding names from a pattern node. */
export function collectBindingNamesFromPattern(pattern: AstMaybeNode): string[] {
  const names: string[] = [];
  visitBindingNames(pattern, (name) => names.push(name));
  return names;
}

/** Add all binding names from a pattern node into an existing array. */
export function appendBindingNamesFromPattern(pattern: AstMaybeNode, target: string[]): void {
  visitBindingNames(pattern, (name) => target.push(name));
}

/** Add all binding names from a pattern node into an existing set. */
export function addBindingNamesFromPatternToSet(pattern: AstMaybeNode, target: Set<string>): void {
  visitBindingNames(pattern, (name) => target.add(name));
}
