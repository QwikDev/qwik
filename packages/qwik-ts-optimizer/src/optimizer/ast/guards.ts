import type {
  AssignmentPattern,
  BindingIdentifier,
  BindingProperty,
  BindingRestElement,
  IdentifierName,
  IdentifierReference,
  AstCompatMaybeNode,
  AstCompatNode,
  AstNode,
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

/**
 * Return the AST `properties` array from a destructure pattern node.
 *
 * Each element is validated via `isAstNode` before being included; the
 * downstream cast to `AstNode[]` is the brand-constructor pattern (one
 * validated cast at the boundary, zero at call sites) — same shape as
 * `forEachAstChild`'s visitor dispatch.
 */
export function getPatternProperties(node: unknown): AstNode[] {
  if (!isAstNode(node) || !Array.isArray(node.properties)) return [];
  return node.properties.filter(isAstNode) as AstNode[];
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

/**
 * Walk every AST child of `node`, calling `visitor` on each.
 *
 * `node` may be the strict oxc `Node` union or the loose duck-typed
 * `AstCompatNode` shape; the loop only needs string-indexable access.
 * Children get re-validated via `isAstNode` before dispatch, so the
 * visitor receives values that satisfy the `AstNode` contract — the
 * cast at the dispatch site is the brand-constructor pattern (one
 * validated cast at the boundary, zero at call sites).
 */
export function forEachAstChild(
  node: AstCompatMaybeNode,
  visitor: (child: AstNode, key: string, parent: AstNode) => void,
  skipKeys: ReadonlySet<string> = DEFAULT_META_KEYS,
): void {
  if (!node || typeof node !== "object") return;

  const compat = node as AstCompatNode;
  for (const key of Object.keys(compat)) {
    if (skipKeys.has(key)) continue;

    const value = compat[key];
    if (!value || typeof value !== "object") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) visitor(item as AstNode, key, compat as AstNode);
      }
      continue;
    }

    if (isAstNode(value)) {
      visitor(value as AstNode, key, compat as AstNode);
    }
  }
}

/**
 * Short-circuit sibling of `forEachAstChild`. Returns `true` on the first
 * child for which `predicate` returns truthy; otherwise iterates every
 * child and returns `false`. Same skip-keys + `isAstNode` validation as
 * `forEachAstChild`; predicate receives the tight `AstNode` form.
 */
export function someAstChild(
  node: AstCompatMaybeNode,
  predicate: (child: AstNode, key: string, parent: AstNode) => boolean,
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
        if (isAstNode(item) && predicate(item as AstNode, key, compat as AstNode)) return true;
      }
      continue;
    }

    if (isAstNode(value) && predicate(value as AstNode, key, compat as AstNode)) return true;
  }
  return false;
}
