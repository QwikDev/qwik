/**
 * Inline/hoist entry strategy QRL builders.
 *
 * When the entry strategy is 'inline' or 'hoist', segments are not emitted
 * as separate files. Instead, QRL declarations use _noopQrl() and segment
 * bodies are attached via .s() calls in the parent module.
 *
 * Stripped segments (via stripCtxName) use sentinel counter naming to avoid
 * conflicts with real symbol names.
 *
 * Implements: ENT-02
 */

// ---------------------------------------------------------------------------
// Sentinel counter
// ---------------------------------------------------------------------------

/**
 * Compute the sentinel counter for a stripped segment's QRL variable name.
 *
 * Formula: 0xFFFF0000 + index * 2
 * Produces: 4294901760, 4294901762, 4294901764, ...
 *
 * This range cannot conflict with real QRL names.
 */
export function getSentinelCounter(index: number): number {
  return 0xffff0000 + index * 2;
}

// ---------------------------------------------------------------------------
// _noopQrl declarations
// ---------------------------------------------------------------------------

/**
 * Build a _noopQrl const declaration for inline/hoist strategy.
 *
 * Format (verified from example_inlined_entry_strategy snapshot):
 * ```
 * const q_{symbolName} = /*#__PURE__* / _noopQrl("{symbolName}");
 * ```
 */
export function buildNoopQrlDeclaration(symbolName: string): string {
  return `const q_${symbolName} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}

/**
 * Build a _noopQrlDEV const declaration for inline/hoist + dev mode.
 *
 * Format (verified from example_dev_mode_inlined snapshot):
 * ```
 * const q_{symbolName} = /*#__PURE__* / _noopQrlDEV("{symbolName}", {
 *     file: "{file}",
 *     lo: {lo},
 *     hi: {hi},
 *     displayName: "{displayName}"
 * });
 * ```
 */
export function buildNoopQrlDevDeclaration(
  symbolName: string,
  devMeta: { file: string; lo: number; hi: number; displayName: string },
): string {
  return (
    `const q_${symbolName} = /*#__PURE__*/ _noopQrlDEV("${symbolName}", {\n` +
    `    file: "${devMeta.file}",\n` +
    `    lo: ${devMeta.lo},\n` +
    `    hi: ${devMeta.hi},\n` +
    `    displayName: "${devMeta.displayName}"\n` +
    `});`
  );
}

// ---------------------------------------------------------------------------
// Stripped _noopQrl declarations (sentinel naming)
// ---------------------------------------------------------------------------

/**
 * Build a sentinel-named _noopQrl declaration for a stripped segment.
 *
 * Format (verified from example_strip_server_code snapshot):
 * ```
 * const q_qrl_{counter} = /*#__PURE__* / _noopQrl("{symbolName}");
 * ```
 */
export function buildStrippedNoopQrl(symbolName: string, strippedIndex: number): string {
  const counter = getSentinelCounter(strippedIndex);
  return `const q_qrl_${counter} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}

/**
 * Build a sentinel-named _noopQrlDEV declaration for a stripped segment in dev mode.
 *
 * Format (verified from example_noop_dev_mode snapshot):
 * ```
 * const q_qrl_{counter} = /*#__PURE__* / _noopQrlDEV("{symbolName}", {
 *     file: "{file}",
 *     lo: {lo},
 *     hi: {hi},
 *     displayName: "{displayName}"
 * });
 * ```
 */
export function buildStrippedNoopQrlDev(
  symbolName: string,
  strippedIndex: number,
  devMeta: { file: string; lo: number; hi: number; displayName: string },
): string {
  const counter = getSentinelCounter(strippedIndex);
  return (
    `const q_qrl_${counter} = /*#__PURE__*/ _noopQrlDEV("${symbolName}", {\n` +
    `    file: "${devMeta.file}",\n` +
    `    lo: ${devMeta.lo},\n` +
    `    hi: ${devMeta.hi},\n` +
    `    displayName: "${devMeta.displayName}"\n` +
    `});`
  );
}

// ---------------------------------------------------------------------------
// .s() call
// ---------------------------------------------------------------------------

/**
 * Build a .s() call that attaches a segment body to its QRL variable.
 *
 * Format (verified from example_inlined_entry_strategy snapshot):
 * ```
 * {varName}.s({bodyText});
 * ```
 */
export function buildSCall(varName: string, bodyText: string): string {
  return `${varName}.s(${bodyText});`;
}

// ---------------------------------------------------------------------------
// Hoist strategy helpers
// ---------------------------------------------------------------------------

/**
 * Build a const function declaration for hoist strategy.
 *
 * Format (verified from example_mutable_children snapshot):
 * ```
 * const {symbolName} = {bodyText};
 * ```
 */
export function buildHoistConstDecl(symbolName: string, bodyText: string): string {
  return `const ${symbolName} = ${bodyText};`;
}

/**
 * Build a simple .s() call for hoist strategy (variable name only, no body).
 *
 * Format (verified from example_mutable_children snapshot):
 * ```
 * {qrlVarName}.s({symbolName});
 * ```
 */
export function buildHoistSCall(qrlVarName: string, symbolName: string): string {
  return `${qrlVarName}.s(${symbolName});`;
}
