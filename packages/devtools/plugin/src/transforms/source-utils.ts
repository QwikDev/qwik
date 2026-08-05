export function injectNamedImportIfMissing(code: string, key: string, name: string): string {
  if (code.includes(key)) {
    return code;
  }
  return `import { ${name} } from '${key}';\n${code}`;
}
