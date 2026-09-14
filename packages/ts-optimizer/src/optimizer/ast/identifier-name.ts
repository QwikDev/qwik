const simpleIdentifierName = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function isSimpleIdentifierName(name: string): boolean {
  return simpleIdentifierName.test(name);
}

export function buildPropertyAccessor(base: string, key: string): string {
  return isSimpleIdentifierName(key) ? `${base}.${key}` : `${base}["${key}"]`;
}
