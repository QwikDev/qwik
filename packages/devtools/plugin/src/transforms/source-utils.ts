/** Prepends on line 1 so the optimizer still sees every source line where it was */
export function prependImportIfMissing(code: string, importStatement: string): string {
  return code.includes(importStatement) ? code : `${importStatement}${code}`;
}

export function injectNamedImportIfMissing(code: string, key: string, name: string): string {
  if (code.includes(key)) {
    return code;
  }
  return prependImportIfMissing(code, `import { ${name} } from '${key}';`);
}
