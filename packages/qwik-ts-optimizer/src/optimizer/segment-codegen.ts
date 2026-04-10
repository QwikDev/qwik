/**
 * Segment module code generation.
 *
 * Generates the source code for extracted segment modules. Each segment
 * module contains only the imports it references plus the exported segment body.
 *
 * Implements: EXTRACT-04
 */

import { rewriteImportSource } from './rewrite-imports.js';
import type { ExtractionResult } from './extract.js';

/**
 * Generate the segment module source code for an extracted segment.
 *
 * Output structure:
 * 1. Import lines (only imports the segment references)
 * 2. "//" separator (if imports present)
 * 3. Nested QRL declarations (if any) + "//" separator
 * 4. `export const {symbolName} = {bodyText};`
 *
 * @param extraction - The extraction result containing segment info
 * @param nestedQrlDecls - Optional nested QRL declarations (for Plan 04)
 * @returns The segment module source code string
 */
export function generateSegmentCode(
  extraction: ExtractionResult,
  nestedQrlDecls?: string[],
): string {
  const parts: string[] = [];

  // Group imports by source to produce one import statement per source
  const importsBySource = new Map<string, string[]>();
  for (const imp of extraction.segmentImports) {
    const rewrittenSource = rewriteImportSource(imp.source);
    const existing = importsBySource.get(rewrittenSource);
    if (existing) {
      if (!existing.includes(imp.localName)) {
        existing.push(imp.localName);
      }
    } else {
      importsBySource.set(rewrittenSource, [imp.localName]);
    }
  }

  // Emit import statements
  for (const [source, names] of importsBySource) {
    parts.push(`import { ${names.join(', ')} } from "${source}";`);
  }

  // Separator after imports
  if (importsBySource.size > 0) {
    parts.push('//');
  }

  // Nested QRL declarations (Plan 04)
  if (nestedQrlDecls && nestedQrlDecls.length > 0) {
    for (const decl of nestedQrlDecls) {
      parts.push(decl);
    }
    parts.push('//');
  }

  // Exported segment body
  parts.push(`export const ${extraction.symbolName} = ${extraction.bodyText};`);

  return parts.join('\n');
}
