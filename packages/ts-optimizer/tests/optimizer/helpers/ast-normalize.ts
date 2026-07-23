export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const POSITION_KEYS = new Set(['start', 'end', 'loc', 'range']);

function shouldStripRaw(
  node: Record<string, unknown>,
  ancestors: readonly Record<string, unknown>[]
): boolean {
  if (node.type === 'Literal' || node.type === 'JSXText') return true;
  const [parent, grandparent, greatGrandparent] = ancestors;
  return (
    parent?.type === 'TemplateElement' &&
    grandparent?.type === 'TemplateLiteral' &&
    greatGrandparent?.type !== 'TaggedTemplateExpression'
  );
}

export function stripAstPositions(
  node: unknown,
  ancestors: readonly Record<string, unknown>[] = []
): unknown {
  if (Array.isArray(node)) return node.map((item) => stripAstPositions(item, ancestors));
  if (!isRecord(node)) return node;
  if (node.type === 'ParenthesizedExpression' && node.expression) {
    return stripAstPositions(node.expression, ancestors);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (POSITION_KEYS.has(key) || (key === 'raw' && shouldStripRaw(node, ancestors))) {
      continue;
    }
    result[key] = stripAstPositions(value, [node, ...ancestors].slice(0, 3));
  }
  return result;
}
