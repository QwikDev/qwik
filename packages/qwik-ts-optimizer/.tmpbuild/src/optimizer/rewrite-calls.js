/**
 * Call form rewriting utilities for the Qwik optimizer.
 *
 * Transforms marker function calls to their Qrl equivalents:
 * - component$ -> componentQrl
 * - useTask$ -> useTaskQrl
 * - $ -> (bare QRL reference, no wrapper)
 * - sync$ -> _qrlSync
 */
import { createRegExp, exactly, oneOrMore, whitespace, wordChar, charIn, charNotIn, global } from 'magic-regexp';
import { rewriteImportSource } from './rewrite-imports.js';
// Keep this as a raw RegExp because the lazy quantifier is the clearest way
// to preserve the current non-greedy block comment stripping behavior.
const blockComment = /\/\*[\s\S]*?\*\//g;
const lineComment = createRegExp(exactly('//').and(charNotIn('\n').times.any()), [global]);
const collapsedWhitespace = createRegExp(oneOrMore(whitespace), [global]);
const spacesAroundOperators = createRegExp(whitespace.times.any()
    .and(charIn('{}(),:;=<>+\\-*/%&|!?.').grouped())
    .and(whitespace.times.any()), [global]);
const singleArrowParam = createRegExp(exactly('(').and(oneOrMore(wordChar).grouped()).and(')=>').at.lineStart());
/**
 * Get the Qrl callee name from a marker name.
 *
 * - "$" -> "" (bare QRL, no wrapper)
 * - "sync$" -> "_qrlSync"
 * - "component$" -> "componentQrl"
 * - "useTask$" -> "useTaskQrl"
 */
export function getQrlCalleeName(markerName) {
    if (markerName === '$')
        return '';
    if (markerName === 'sync$')
        return '_qrlSync';
    return markerName.slice(0, -1) + 'Qrl';
}
/**
 * Build a QRL const declaration string.
 *
 * When explicit extensions are requested, appends the output extension.
 */
export function buildQrlDeclaration(symbolName, canonicalFilename, explicitExtensions, _segmentExtension, outputExtension) {
    const ext = explicitExtensions ? (outputExtension ?? '.js') : '';
    return `const q_${symbolName} = /*#__PURE__*/ qrl(()=>import("./${canonicalFilename}${ext}"), "${symbolName}");`;
}
/**
 * Minify a function body string for sync$ serialization.
 */
function minifyFunctionText(text) {
    let result = text;
    // Remove block comments
    result = result.replace(blockComment, '');
    // Remove line comments
    result = result.replace(lineComment, '');
    // Collapse whitespace
    result = result.replace(collapsedWhitespace, ' ');
    // Remove spaces around operators and delimiters
    result = result.replace(spacesAroundOperators, '$1');
    result = result.trim();
    // Strip parentheses around single arrow function parameter: (x)=> -> x=>
    result = result.replace(singleArrowParam, '$1=>');
    return result;
}
/**
 * Build the sync$ transformation.
 * sync$ does NOT extract a segment -- it wraps with _qrlSync instead.
 */
export function buildSyncTransform(originalFnText) {
    const minified = minifyFunctionText(originalFnText);
    return `_qrlSync(${originalFnText}, "${minified}")`;
}
/** Qrl callee names that get PURE annotations. */
const PURE_CALLEES = new Set(['componentQrl', 'qrl', 'qrlDEV']);
/**
 * Determine if a QRL wrapper call needs a PURE annotation.
 */
export function needsPureAnnotation(qrlCalleeName) {
    return PURE_CALLEES.has(qrlCalleeName);
}
const QWIK_PACKAGES = [
    '@qwik.dev/core',
    '@qwik.dev/react',
    '@qwik.dev/router',
    '@builder.io/qwik-react',
    '@builder.io/qwik-city',
    '@builder.io/qwik',
];
function isQwikPackage(source) {
    return QWIK_PACKAGES.some((pkg) => source === pkg || source.startsWith(pkg + '/'));
}
/**
 * Get the import source for a Qrl callee.
 *
 * Non-Qwik packages import the Qrl variant from the same package.
 * Qwik sub-packages preserve their source (with legacy rewriting).
 */
export function getQrlImportSource(qrlCalleeName, originalSource) {
    if (originalSource && !isQwikPackage(originalSource)) {
        return originalSource;
    }
    if (originalSource &&
        originalSource !== '@qwik.dev/core' &&
        originalSource !== '@builder.io/qwik' &&
        isQwikPackage(originalSource)) {
        return rewriteImportSource(originalSource);
    }
    if (qrlCalleeName === 'qwikifyQrl')
        return '@qwik.dev/react';
    const ROUTER_QRLS = new Set([
        'globalActionQrl', 'routeActionQrl', 'routeLoaderQrl', 'zodQrl',
    ]);
    if (ROUTER_QRLS.has(qrlCalleeName))
        return '@qwik.dev/router';
    return '@qwik.dev/core';
}
//# sourceMappingURL=rewrite-calls.js.map