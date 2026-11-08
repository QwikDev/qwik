import type {
  BindingPattern,
  BindingIdentifier,
  IdentifierReference,
  AssignmentTarget,
  AssignmentTargetRest,
  AssignmentTargetWithDefault,
  BindingRestElement,
  FormalParameterRest,
  TSParameterProperty,
} from '@oxc-project/types';

/**
 * `BindingRestElement` and `FormalParameterRest` both surface as `type: "RestElement"` at runtime,
 * so `visitPatternIdentifiers` handles them in one arm.
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

function visitPatternIdentifiers(
  node:
    | BindingPatternLike
    | AssignmentTarget
    | AssignmentTargetRest
    | AssignmentTargetWithDefault
    | null
    | undefined,
  visit: (identifier: BindingIdentifier | IdentifierReference) => void
): void {
  if (!node) {
    return;
  }

  switch (node.type) {
    case 'Identifier':
      visit(node);
      break;

    case 'ObjectPattern':
      for (const prop of node.properties ?? []) {
        const target = prop.type === 'RestElement' ? prop.argument : prop.value;
        visitPatternIdentifiers(target, visit);
      }
      break;

    case 'ArrayPattern':
      for (const elem of node.elements ?? []) {
        visitPatternIdentifiers(elem, visit);
      }
      break;

    case 'RestElement':
      visitPatternIdentifiers(node.argument, visit);
      break;

    case 'AssignmentPattern':
      visitPatternIdentifiers(node.left, visit);
      break;

    case 'TSParameterProperty':
      visitPatternIdentifiers(node.parameter, visit);
      break;

    case 'MemberExpression':
      break;
    case 'TSAsExpression':
    case 'TSSatisfiesExpression':
    case 'TSNonNullExpression':
    case 'TSTypeAssertion':
      visitPatternIdentifiers(node.expression as AssignmentTarget, visit);
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
  visitPatternIdentifiers(pattern, (identifier) => names.push(identifier.name));
  return names;
}

export function appendBindingNamesFromPattern(
  pattern: BindingPatternLike | null | undefined,
  target: string[]
): void {
  visitPatternIdentifiers(pattern, (identifier) => target.push(identifier.name));
}

export function addBindingNamesFromPatternToSet(
  pattern: BindingPatternLike | null | undefined,
  target: Set<string>
): void {
  visitPatternIdentifiers(pattern, (identifier) => target.add(identifier.name));
}

export function collectAssignedIdentifiers(
  target: AssignmentTarget | BindingPatternLike
): (BindingIdentifier | IdentifierReference)[] {
  const identifiers: (BindingIdentifier | IdentifierReference)[] = [];
  visitPatternIdentifiers(target, (identifier) => identifiers.push(identifier));
  return identifiers;
}
