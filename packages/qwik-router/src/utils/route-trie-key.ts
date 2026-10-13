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
