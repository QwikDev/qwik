/** Shared formatting for rebuilding import statements from their parts. */

/** `imported as local` when they differ, else just `local`. */
export function formatNamedImportPart(imported: string, local: string): string {
  return imported !== local ? `${imported} as ${local}` : local;
}

/**
 * Assemble the clause between `import` and `from`: default and/or namespace, or default and/or
 * named list. Returns '' when nothing survives.
 */
export function formatImportParts(
  defaultPart: string,
  nsPart: string,
  namedParts: readonly string[]
): string {
  if (nsPart) {
    return defaultPart ? `${defaultPart}, ${nsPart}` : nsPart;
  }
  if (namedParts.length > 0) {
    const named = `{ ${namedParts.join(', ')} }`;
    return defaultPart ? `${defaultPart}, ${named}` : named;
  }
  return defaultPart;
}

export function formatImportStatement(parts: string, quote: string, source: string): string {
  return `import ${parts} from ${quote}${source}${quote};`;
}
