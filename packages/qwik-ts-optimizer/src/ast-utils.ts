const DEFAULT_META_KEYS = new Set(["type", "start", "end", "loc", "range"]);

export function isAstNode(value: any): value is { type: string } {
  return !!value && typeof value === "object" && typeof value.type === "string";
}

export function forEachAstChild(
  node: any,
  visitor: (child: any, key: string, parent: any) => void,
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
