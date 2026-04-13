import type { AstCompatMaybeNode, AstCompatNode, AstNode } from './ast-types.js';

const DEFAULT_META_KEYS = new Set(["type", "start", "end", "loc", "range"]);

export function isAstNode(value: unknown): value is AstCompatNode {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { type?: unknown };
  return typeof candidate.type === "string";
}

export function forEachAstChild(
  node: AstCompatMaybeNode,
  visitor: (child: AstCompatNode, key: string, parent: AstCompatNode) => void,
  skipKeys: ReadonlySet<string> = DEFAULT_META_KEYS,
): void {
  if (!node || typeof node !== "object") return;

  for (const key of Object.keys(node)) {
    if (skipKeys.has(key)) continue;

    const value = node[key];
    if (!value || typeof value !== "object") continue;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (isAstNode(item)) visitor(item, key, node);
      }
      continue;
    }

    if (isAstNode(value)) {
      visitor(value, key, node);
    }
  }
}
