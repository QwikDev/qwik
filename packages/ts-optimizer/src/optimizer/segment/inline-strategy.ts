/**
 * Inline/hoist entry strategies keep segment bodies in the parent module — QRL declarations use
 * `_noopQrl()` and bodies attach via `.s()` calls rather than landing in separate files. Stripped
 * segments use sentinel counter naming to avoid colliding with real symbol names.
 */

import { formatDevMeta, type NoopQrlDevMeta } from './dev-mode.js';

/** The `0xFFFF0000 + index * 2` range cannot conflict with real QRL names. */
export function getSentinelCounter(index: number): number {
  return 0xffff0000 + index * 2;
}

function buildNoopQrl(varName: string, symbolName: string): string {
  return `const ${varName} = /*#__PURE__*/ _noopQrl("${symbolName}");`;
}

function buildNoopQrlDev(varName: string, symbolName: string, devMeta: NoopQrlDevMeta): string {
  return `const ${varName} = /*#__PURE__*/ _noopQrlDEV("${symbolName}", ${formatDevMeta(devMeta)});`;
}

export function buildNoopQrlDeclaration(symbolName: string): string {
  return buildNoopQrl(`q_${symbolName}`, symbolName);
}

export function buildNoopQrlDevDeclaration(symbolName: string, devMeta: NoopQrlDevMeta): string {
  return buildNoopQrlDev(`q_${symbolName}`, symbolName, devMeta);
}

export function buildStrippedNoopQrl(symbolName: string, strippedIndex: number): string {
  return buildNoopQrl(`q_qrl_${getSentinelCounter(strippedIndex)}`, symbolName);
}

export function buildStrippedNoopQrlDev(
  symbolName: string,
  strippedIndex: number,
  devMeta: NoopQrlDevMeta
): string {
  return buildNoopQrlDev(`q_qrl_${getSentinelCounter(strippedIndex)}`, symbolName, devMeta);
}

export function buildSCall(varName: string, bodyText: string): string {
  return `${varName}.s(${bodyText});`;
}

export function buildHoistConstDecl(symbolName: string, bodyText: string): string {
  return `const ${symbolName} = ${bodyText};`;
}

export function buildHoistSCall(qrlVarName: string, symbolName: string): string {
  return `${qrlVarName}.s(${symbolName});`;
}
