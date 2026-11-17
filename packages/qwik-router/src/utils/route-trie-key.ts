import type { RouteData } from '../runtime/src/types';

/**
 * Route trie metadata keys start with `_` (`_4`, `_W`, …), so static segments that start with `_`
 * are stored with an extra `_` to keep the two apart.
 */
export const escapeStaticTrieKey = (segment: string) =>
  segment.startsWith('_') ? '_' + segment : segment;

/** The URL segment for a static trie key. */
export const unescapeStaticTrieKey = (key: string) => (key.startsWith('_') ? key.slice(1) : key);

/** Whether a trie key is a static segment rather than metadata. */
export const isStaticTrieKey = (key: string) => !key.startsWith('_') || key.startsWith('__');

/** Distinguish parameter branches by their prefix and suffix. */
export const getWildcardTrieKey = (node: { _0?: string; _9?: string }) =>
  node._0 || node._9 ? `_W${JSON.stringify([node._0 ?? '', node._9 ?? ''])}` : '_W';

export const isWildcardTrieKey = (key: string) => key === '_W' || key.startsWith('_W[');

/** Accept existing single-child plans as well as wildcard arrays. */
export function getWildcardChildren(node: RouteData): RouteData[] {
  const children = node._W as RouteData | RouteData[] | undefined;
  if (!children) {
    return [];
  }
  return Array.isArray(children) ? children : [children];
}
