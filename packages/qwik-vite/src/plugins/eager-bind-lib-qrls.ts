/**
 * Server builds resolve library chunk QRLs eagerly, mirroring the optimizer's rule of binding
 * `.s()` on every server segment. Library dists ship module-level lazy declarations:
 *
 * ```
 * const q_x = _qrlWithChunk('chunk-name.js', () => import('./chunk.qwik.mjs'), 'symbol');
 * ```
 *
 * Each one becomes a static chunk import plus a rebinding of the declared name:
 *
 * ```
 * import { symbol as symbol_eager0 } from './chunk.qwik.mjs';
 * const q_x_lazy0 = _qrlWithChunk(...);
 * const q_x = (q_x_lazy0.s(symbol_eager0), q_x_lazy0);
 * ```
 *
 * The binding lives in the declaration initializer, not a standalone statement, so it survives
 * `sideEffects: false` tree-shaking exactly when the QRL itself is used. The chunk name still
 * serializes for client resume. Cycle-safe: chunk modules only reference runtime bindings inside
 * function bodies, never during module evaluation.
 */
const LAZY_CHUNK_QRL_DECL_RE =
  /\bconst\s+([\w$]+)\s*=\s*(?:\/\*\s*[@#]__PURE__\s*\*\/\s*)?_qrlWithChunk(?:DEV)?\(\s*['"][^'"]*['"]\s*,\s*\(\)\s*=>\s*import\(\s*['"]([^'"]+)['"]\s*\)(?:\.then\(\s*\(?([\w$]+)\)?\s*=>\s*\3\.([\w$]+)\s*\))?\s*,\s*['"]([^'"]+)['"]/;

/** Returns the transformed code, or `null` when the module declares no lazy chunk QRLs. */
export function eagerBindLibraryQrls(code: string): string | null {
  const imports: string[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const match = LAZY_CHUNK_QRL_DECL_RE.exec(lines[i]);
    if (match === null) {
      continue;
    }
    const [, declaredName, importSpecifier, , pluckedExport, symbol] = match;
    const localName = `${symbol}_eager${imports.length}`;
    const lazyName = `${declaredName}_lazy${imports.length}`;
    // merged lib chunks pluck a namespace re-export via `.then(n => n.x)`; the runtime then
    // indexes it with the symbol name, so the eager binding must do the same
    const exportName = pluckedExport ?? symbol;
    const boundValue =
      pluckedExport === undefined ? localName : `${localName}[${JSON.stringify(symbol)}]`;
    imports.push(
      `import { ${exportName} as ${localName} } from ${JSON.stringify(importSpecifier)};`
    );
    lines[i] =
      lines[i].replace(`const ${declaredName} `, `const ${lazyName} `) +
      `\nconst ${declaredName} = (${lazyName}.s(${boundValue}), ${lazyName});`;
  }
  if (imports.length === 0) {
    return null;
  }
  return `${imports.join('\n')}\n${lines.join('\n')}`;
}
