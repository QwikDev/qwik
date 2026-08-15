/**
 * `\\b` treats `$` as a non-word char, so `\\bfoo$\\b` never matches a real use of a `$`-suffixed
 * identifier. These lookaround boundaries treat `$` as part of the word.
 */
const identifierPatternCache = new Map<string, RegExp>();

function escapeForRegex(name: string): string {
  return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function wholeIdentifierPattern(name: string): RegExp {
  let pattern = identifierPatternCache.get(name);
  if (!pattern) {
    pattern = new RegExp(`(?<![\\w$])${escapeForRegex(name)}(?![\\w$])`);
    identifierPatternCache.set(name, pattern);
  }
  return pattern;
}
