import {
  createRegExp,
  exactly,
  oneOrMore,
  whitespace,
  wordChar,
  charIn,
  charNotIn,
  global,
} from 'magic-regexp';
import { transformSync as oxcTransformSync } from 'oxc-transform';
import { rewriteImportSource } from './rewrite-imports.js';
import { isQwikPackageSource } from '../qwik/qwik-packages.js';
import { getQrlCalleeName } from '../qwik/qrl-naming.js';
import { quoteAsStringLiteral } from '../edit/string-literal.js';
import { scanMatchingParenForward } from '../edit/text-scanning.js';
import { eventHandlerQpParams } from '../jsx/loop-hoisting.js';

const blockComment = /\/\*[\s\S]*?\*\//g;

const lineComment = createRegExp(exactly('//').and(charNotIn('\n').times.any()), [global]);

const collapsedWhitespace = createRegExp(oneOrMore(whitespace), [global]);

const spacesAroundOperators = createRegExp(
  whitespace.times
    .any()
    .and(charIn('{}(),:;=<>+\\-*/%&|!?.').grouped())
    .and(whitespace.times.any()),
  [global]
);

const singleArrowParam = createRegExp(
  exactly('(').and(oneOrMore(wordChar).grouped()).and(')=>').at.lineStart()
);

export { getQrlCalleeName } from '../qwik/qrl-naming.js';

interface MovedCapturesSource {
  readonly ctxKind: 'function' | 'eventHandler' | 'jSXProp';
  readonly ctxName: string;
  readonly calleeName: string;
  readonly movedCaptures?: boolean;
  readonly isInlinedQrl?: boolean;
}

/**
 * Event handlers whose captures were lifted into params need a runtime `.m()` marker. Only direct
 * `on*$={fn}` handlers qualify — nested markers (`server$`, `sync$`, …) keep their captures.
 */
export function hasMovedCaptures(ext: MovedCapturesSource): boolean {
  return (
    ext.ctxKind === 'eventHandler' &&
    !ext.isInlinedQrl &&
    ext.calleeName === ext.ctxName &&
    ext.movedCaptures === true
  );
}

/** Appends the `.m()` moved-captures marker to a `;`-terminated QRL declaration. */
export function markMovedCaptures(decl: string, ext: MovedCapturesSource): string {
  if (!hasMovedCaptures(ext)) return decl;
  return decl.slice(0, -1) + '.m();';
}

/** Worker QRLs load through a dedicated chunk; the prefix tells the bundler to emit one. */
export const WORKER_CHUNK_PREFIX = '__QWIK_WORKER_QRL__:';

export function isWorkerExtraction(ext: { readonly ctxName: string }): boolean {
  return ext.ctxName === 'worker$';
}

export function buildWorkerQrlDeclaration(
  varName: string,
  symbolName: string,
  canonicalFilename: string,
  explicitExtensions?: boolean,
  outputExtension?: string,
  devMeta?: string
): string {
  const ext = explicitExtensions ? (outputExtension ?? '.js') : '';
  const chunk = `${WORKER_CHUNK_PREFIX}./${canonicalFilename}${ext}`;
  const helper = devMeta ? '_qrlWithChunkDEV' : '_qrlWithChunk';
  const devArg = devMeta ? `, ${devMeta}` : '';
  return `const ${varName} = /*#__PURE__*/ ${helper}("${chunk}", ()=>import("./${canonicalFilename}${ext}"), "${symbolName}"${devArg});`;
}

export function buildQrlDeclaration(
  symbolName: string,
  canonicalFilename: string,
  explicitExtensions?: boolean,
  _segmentExtension?: string,
  outputExtension?: string
): string {
  const ext = explicitExtensions ? (outputExtension ?? '.js') : '';
  return `const q_${symbolName} = /*#__PURE__*/ qrl(()=>import("./${canonicalFilename}${ext}"), "${symbolName}");`;
}

function minifyFunctionText(text: string): string {
  let result = text;

  result = result.replace(blockComment, '');
  result = result.replace(lineComment, '');
  result = result.replace(collapsedWhitespace, ' ');
  result = result.replace(spacesAroundOperators, '$1');
  result = result.trim();
  result = result.replace(singleArrowParam, '$1=>');

  return result;
}

function stripTypesForSerialization(fnText: string): string {
  try {
    const wrapped = `const __qs = (${fnText});`;
    const out = oxcTransformSync('__sync__.tsx', wrapped, {
      typescript: { onlyRemoveTypeImports: false },
      jsx: 'preserve',
    });
    if (!out.code) return fnText;
    const openIdx = out.code.indexOf('(', out.code.indexOf('='));
    if (openIdx < 0) return fnText;
    const closeIdx = scanMatchingParenForward(out.code, openIdx + 1);
    return out.code.slice(openIdx + 1, closeIdx - 1);
  } catch {
    return fnText;
  }
}

export function buildSyncTransform(originalFnText: string): string {
  const minified = minifyFunctionText(stripTypesForSerialization(originalFnText));
  return `_qrlSync(${originalFnText}, ${quoteAsStringLiteral(minified)})`;
}

const PURE_CALLEES = new Set(['componentQrl', 'qrl', 'qrlDEV']);

export function needsPureAnnotation(qrlCalleeName: string): boolean {
  return PURE_CALLEES.has(qrlCalleeName);
}

export function getQrlImportSource(qrlCalleeName: string, originalSource?: string): string {
  if (originalSource && !isQwikPackageSource(originalSource)) {
    return originalSource;
  }

  if (
    originalSource &&
    originalSource !== '@qwik.dev/core' &&
    originalSource !== '@builder.io/qwik' &&
    isQwikPackageSource(originalSource)
  ) {
    return rewriteImportSource(originalSource);
  }

  if (qrlCalleeName === 'qwikifyQrl') return '@qwik.dev/react';

  const ROUTER_QRLS = new Set(['globalActionQrl', 'routeActionQrl', 'routeLoaderQrl', 'zodQrl']);
  if (ROUTER_QRLS.has(qrlCalleeName)) return '@qwik.dev/router';

  return '@qwik.dev/core';
}
