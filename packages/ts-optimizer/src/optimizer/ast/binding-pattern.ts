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

function formatPropertyKey(key: import('@oxc-project/types').PropertyKey): string | undefined {
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'Literal' && ['string', 'number', 'bigint'].includes(typeof key.value)) {
    return String(key.value);
  }
  return undefined;
}

export function formatBindingPattern(pattern: BindingPatternLike): string | undefined {
  switch (pattern.type) {
    case 'Identifier':
      return pattern.name;
    case 'RestElement': {
      const argument = formatBindingPattern(pattern.argument);
      return argument === undefined ? undefined : `...${argument}`;
    }
    case 'ArrayPattern': {
      if (pattern.elements.length === 0) {
        return undefined;
      }
      return `[${pattern.elements
        .map((element) => (element === null ? '' : formatBindingPattern(element)))
        .filter((element) => element !== undefined)
        .join(', ')}]`;
    }
    case 'ObjectPattern': {
      const properties = pattern.properties.flatMap((property) => {
        if (property.type === 'RestElement') {
          return [];
        }
        const key = formatPropertyKey(property.key);
        if (key === undefined) {
          return [];
        }
        if (property.shorthand) {
          return [key];
        }
        const value = formatBindingPattern(property.value);
        return value === undefined ? [] : [`${key}: ${value}`];
      });
      return properties.length === 0 ? undefined : `{${properties.join(', ')}}`;
    }
    case 'TSParameterProperty':
      return formatBindingPattern(pattern.parameter);
    case 'AssignmentPattern':
      return undefined;
    default: {
      const _exhaustive: never = pattern;
      throw new Error(`unhandled binding-pattern node: ${(_exhaustive as { type?: string }).type}`);
    }
  }
}

function visitBindingNames(
  node: BindingPatternLike | null | undefined,
  visit: (name: string) => void
): void {
  if (!node) {
    return;
  }

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
