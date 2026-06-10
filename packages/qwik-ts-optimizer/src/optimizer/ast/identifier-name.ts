import { charIn, createRegExp } from 'magic-regexp';

const simpleIdentifierName = createRegExp(
  charIn('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$')
    .and(charIn('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$').times.any())
    .at.lineStart()
    .at.lineEnd(),
);

/** Check whether a property key can use dot notation safely. */
export function isSimpleIdentifierName(name: string): boolean {
  return simpleIdentifierName.test(name);
}

/** Build either dot-notation or bracket-notation access for a property key. */
export function buildPropertyAccessor(base: string, key: string): string {
  return isSimpleIdentifierName(key)
    ? `${base}.${key}`
    : `${base}["${key}"]`;
}
