import type {
  AssignmentPattern,
  BindingIdentifier,
  BindingProperty,
  BindingRestElement,
  IdentifierName,
  IdentifierReference,
  AstCompatMaybeNode,
  AstCompatNode,
  VariableDeclarator,
} from '../../ast-types.js';

const DEFAULT_META_KEYS = new Set(["type", "start", "end", "loc", "range"]);

export function isAstNode(value: unknown): value is AstCompatNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { type?: unknown };
  return typeof candidate.type === "string";
}

export type AstIdentifierNode = IdentifierName | IdentifierReference | BindingIdentifier;
export type AstRangedNode = AstCompatNode & { start: number; end: number };

export function hasRange(node: unknown): node is AstRangedNode {
  return isAstNode(node) && typeof node.start === "number" && typeof node.end === "number";
}

export function isIdentifierNode(node: unknown): node is AstIdentifierNode {
  return isAstNode(node) && node.type === "Identifier" && typeof node.name === "string";
}

export function isRangedIdentifierNode(node: unknown): node is AstIdentifierNode & AstRangedNode {
  return isIdentifierNode(node) && hasRange(node);
}

export function isAssignmentPatternNode(node: unknown): node is AssignmentPattern {
  return isAstNode(node) && node.type === "AssignmentPattern";
}

export function isPropertyNode(node: unknown): node is BindingProperty {
  return isAstNode(node) && node.type === "Property";
}

export function isRestElementNode(node: unknown): node is BindingRestElement {
  return isAstNode(node) && node.type === "RestElement";
}

export function isVariableDeclaratorNode(node: unknown): node is VariableDeclarator {
  return isAstNode(node) && node.type === "VariableDeclarator";
}

export function getPatternProperties(node: unknown): AstCompatNode[] {
  if (!isAstNode(node) || !Array.isArray(node.properties)) return [];
  return node.properties.filter(isAstNode);
}

export function getObjectPropertyKeyName(key: unknown): string | null {
  if (isIdentifierNode(key)) {
    return key.name;
  }
  if (isAstNode(key) && (key.type === "StringLiteral" || key.type === "Literal")) {
    return key.value == null ? null : String(key.value);
  }
  return null;
}

export function getAssignedIdentifierName(value: unknown): string | null {
  if (isIdentifierNode(value)) {
    return value.name;
  }
  if (isAssignmentPatternNode(value) && isIdentifierNode(value.left)) {
    return value.left.name;
  }
  return null;
}

export function forEachAstChild(
  node: AstCompatMaybeNode,
  visitor: (child: AstCompatNode, key: string, parent: AstCompatNode) => void,
  skipKeys: ReadonlySet<string> = DEFAULT_META_KEYS,
): void {
  if (!node || typeof node !== "object") return;

  // `node` may be either the strict oxc `Node` union or the loose
  // `AstCompatNode` shape; the loop only needs string-indexable access
  // and the children get re-validated via `isAstNode` before dispatch.
  const compat = node as AstCompatNode;
  for (const key of Object.keys(compat)) {
    if (skipKeys.has(key)) continue;

    const value = compat[key];
    if (!value || typeof value !== "object") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) visitor(item, key, compat);
      }
      continue;
    }

    if (isAstNode(value)) {
      visitor(value, key, compat);
    }
  }
}

/**
 * Short-circuit sibling of `forEachAstChild`. Returns `true` on the first
 * child for which `predicate` returns truthy; otherwise iterates every
 * child and returns `false`. Same skip-keys + `isAstNode` validation as
 * `forEachAstChild`.
 */
export function someAstChild(
  node: AstCompatMaybeNode,
  predicate: (child: AstCompatNode, key: string, parent: AstCompatNode) => boolean,
  skipKeys: ReadonlySet<string> = DEFAULT_META_KEYS,
): boolean {
  if (!node || typeof node !== "object") return false;

  const compat = node as AstCompatNode;
  for (const key of Object.keys(compat)) {
    if (skipKeys.has(key)) continue;

    const value = compat[key];
    if (!value || typeof value !== "object") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item) && predicate(item, key, compat)) return true;
      }
      continue;
    }

    if (isAstNode(value) && predicate(value, key, compat)) return true;
  }
  return false;
}
