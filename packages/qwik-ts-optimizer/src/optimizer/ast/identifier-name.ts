import { charIn, createRegExp } from 'magic-regexp';

const simpleIdentifierName = createRegExp(
  charIn('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_$')
    .and(charIn('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$').times.any())
    .at.lineStart()
    .at.lineEnd(),
);

export function isSimpleIdentifierName(name: string): boolean {
  return simpleIdentifierName.test(name);
}

export function buildPropertyAccessor(base: string, key: string): string {
  return isSimpleIdentifierName(key)
    ? `${base}.${key}`
    : `${base}["${key}"]`;
}
