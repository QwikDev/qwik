import type {
  BindingPattern,
  BindingRestElement,
  FormalParameterRest,
  TSParameterProperty,
} from '@oxc-project/types';

/**
 * `BindingRestElement` and `FormalParameterRest` both surface as `type: "RestElement"` at runtime,
 * so `visitBindingNames` handles them in one arm.
 */
export type BindingPatternLike =
  | BindingPattern
  | BindingRestElement
  | FormalParameterRest
  | TSParameterProperty;

function visitBindingNames(
  node: BindingPatternLike | null | undefined,
  visit: (name: string) => void
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

export function collectBindingNamesFromPattern(
  pattern: BindingPatternLike | null | undefined
): string[] {
  const names: string[] = [];
  visitBindingNames(pattern, (name) => names.push(name));
  return names;
}

export function appendBindingNamesFromPattern(
  pattern: BindingPatternLike | null | undefined,
  target: string[]
): void {
  visitBindingNames(pattern, (name) => target.push(name));
}

export function addBindingNamesFromPatternToSet(
  pattern: BindingPatternLike | null | undefined,
  target: Set<string>
): void {
  visitBindingNames(pattern, (name) => target.add(name));
}
