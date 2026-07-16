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

import { formatDevMeta, type NoopQrlDevMeta } from './dev-mode.js';

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

function buildNoopQrl(varName: string, symbolName: string): string {
  return `const ${varName} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}

function buildNoopQrlDev(varName: string, symbolName: string, devMeta: NoopQrlDevMeta): string {
  return `const ${varName} = /*#__PURE__*/ _noopQrlDEV("${symbolName}", ${formatDevMeta(devMeta)});`;
}

// ---------------------------------------------------------------------------
// _noopQrl declarations
// ---------------------------------------------------------------------------

/** `_noopQrl` declaration for an inline/hoist segment. */
export function buildNoopQrlDeclaration(symbolName: string): string {
  return buildNoopQrl(`q_${symbolName}`, symbolName);
}

/** `_noopQrlDEV` declaration for an inline/hoist segment in dev mode. */
export function buildNoopQrlDevDeclaration(symbolName: string, devMeta: NoopQrlDevMeta): string {
  return buildNoopQrlDev(`q_${symbolName}`, symbolName, devMeta);
}

// ---------------------------------------------------------------------------
// Stripped _noopQrl declarations (sentinel naming)
// ---------------------------------------------------------------------------

/** Sentinel-named `_noopQrl` declaration for a stripped segment. */
export function buildStrippedNoopQrl(symbolName: string, strippedIndex: number): string {
  return buildNoopQrl(`q_qrl_${getSentinelCounter(strippedIndex)}`, symbolName);
}

/** Sentinel-named `_noopQrlDEV` declaration for a stripped segment in dev mode. */
export function buildStrippedNoopQrlDev(
  symbolName: string,
  strippedIndex: number,
  devMeta: NoopQrlDevMeta,
): string {
  return buildNoopQrlDev(`q_qrl_${getSentinelCounter(strippedIndex)}`, symbolName, devMeta);
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
