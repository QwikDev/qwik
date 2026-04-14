/**
 * Segment post-processing helpers for the transform pipeline.
 *
 * Contains TS type probes, regex patterns, and the postProcessSegmentCode
 * function that applies TS stripping, const replacement, DCE, side-effect
 * simplification, HMR injection, and import cleanup to generated segments.
 */

import {
  anyOf,
  charIn,
  createRegExp,
  digit,
  exactly,
  global,
  oneOrMore,
  whitespace,
  wordBoundary,
  wordChar,
} from "magic-regexp";
import { transformSync as oxcTransformSync, type TransformOptions } from "oxc-transform";
import type { SegmentCaptureInfo } from '../segment-codegen.js';
import type { TransformModulesOptions } from '../types.js';
import {
  applySegmentConstReplacement,
  applySegmentSideEffectSimplification,
  injectUseHmr,
  removeUnusedImports,
} from './module-cleanup.js';
import { applySegmentDCE, hasSegmentDcePatterns } from './dead-code.js';

export interface SegmentPostProcessOptions {
  symbolName: string;
  canonicalFilename: string;
  extension: string;
  ctxName: string;
  sourceExtensions: Map<string, string>;
  shouldTranspileTs: boolean;
  shouldTranspileJsx: boolean;
  isServer?: boolean;
  emitMode: string;
  devFile?: string;
}

export function getManualEntryMap(
  strategy: Exclude<NonNullable<TransformModulesOptions['entryStrategy']>, { type: 'inline' } | { type: 'hoist' }>,
): Record<string, string> | undefined {
  return strategy.manual;
}

const tsTypeAnnotationProbe = createRegExp(
  exactly(":")
    .and(whitespace.times.any())
    .and(charIn("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_${[(")),
);

const tsAngleAssertionProbe = createRegExp(
  exactly("<")
    .and(oneOrMore(wordChar))
    .and(">")
    .notBefore(whitespace.times.any(), anyOf(")", ",", ";")),
);

const tsGenericTypeListProbe = createRegExp(
  exactly("<").and(oneOrMore(wordChar)).and(","),
);

const tsAsCastProbe = createRegExp(
  wordBoundary.and("as").and(oneOrMore(whitespace)).and(wordChar),
);

const tsDeclarationProbe = createRegExp(
  wordBoundary
    .and(anyOf("interface", "type", "enum"))
    .and(oneOrMore(whitespace))
    .and(wordChar),
);

const tsNonNullPropertyProbe = createRegExp(
  oneOrMore(wordChar).and(whitespace.times.any()).and(anyOf("!.", "![")),
);

const tsGenericCallProbe = createRegExp(
  exactly("<")
    .and(charIn("ABCDEFGHIJKLMNOPQRSTUVWXYZ"))
    .and(wordChar.times.any())
    .and(
      whitespace
        .times.any()
        .and(",")
        .and(whitespace.times.any())
        .and(oneOrMore(wordChar))
        .times.any(),
    )
    .and(whitespace.times.any())
    .and(">")
    .and(whitespace.times.any())
    .and("("),
);

const pureAnnotationComment = createRegExp(exactly("/* @__PURE__ */"), [global]);

export const leadingSquareBracket = createRegExp(exactly("[").at.lineStart());

export const trailingSquareBracket = createRegExp(exactly("]").at.lineEnd());

export const leadingDot = createRegExp(exactly(".").at.lineStart());

export const numberedPaddingParam = createRegExp(
  exactly("_").and(oneOrMore(digit)).at.lineStart().at.lineEnd(),
);

export const paddingParam = createRegExp(
  exactly("_").and(digit.times.any()).at.lineStart().at.lineEnd(),
);

const wholeWordPatternCache = new Map<string, RegExp>();

export function getWholeWordPattern(name: string): RegExp {
  const cached = wholeWordPatternCache.get(name);
  if (cached) {
    return cached;
  }

  const pattern = createRegExp(
    wordBoundary.and(exactly(name)).and(wordBoundary),
  );
  wholeWordPatternCache.set(name, pattern);
  return pattern;
}

function hasCapturePayload(
  captureInfo: SegmentCaptureInfo,
  includeConstLiterals: boolean,
): boolean {
  if (captureInfo.captureNames.length > 0) return true;
  if (captureInfo.autoImports.length > 0) return true;
  if (captureInfo.movedDeclarations.length > 0) return true;
  return includeConstLiterals && captureInfo.constLiterals !== undefined;
}

export function getEffectiveCaptureInfo(
  captureInfo: SegmentCaptureInfo,
  isInlinedQrl: boolean,
): SegmentCaptureInfo | undefined {
  const includeConstLiterals = !isInlinedQrl;
  if (!hasCapturePayload(captureInfo, includeConstLiterals)) {
    return undefined;
  }

  if (isInlinedQrl) {
    return { ...captureInfo, skipCaptureInjection: true };
  }

  return captureInfo;
}

/**
 * Apply post-processing transforms to generated segment code:
 * TS stripping, const replacement, DCE, side-effect simplification, HMR injection, import cleanup.
 */
export function postProcessSegmentCode(
  code: string,
  opts: SegmentPostProcessOptions,
): string {
  let result = code;
  const filename = opts.canonicalFilename + opts.extension;

  // Strip TS types when transpileTs is enabled
  if (opts.shouldTranspileTs) {
    const hasTsSyntax =
      tsTypeAnnotationProbe.test(result) ||
      tsAngleAssertionProbe.test(result) ||
      tsGenericTypeListProbe.test(result) ||
      tsAsCastProbe.test(result) ||
      tsDeclarationProbe.test(result) ||
      tsNonNullPropertyProbe.test(result) ||
      tsGenericCallProbe.test(result);
    if (hasTsSyntax) {
      const tsStripOptions: TransformOptions = {
        typescript: { onlyRemoveTypeImports: false },
      };
      if (!opts.shouldTranspileJsx) {
        tsStripOptions.jsx = "preserve";
      }
      const sourceExt =
        opts.sourceExtensions.get(opts.symbolName) ?? opts.extension;
      const tsStripped = oxcTransformSync(
        opts.canonicalFilename + sourceExt,
        result,
        tsStripOptions,
      );
      if (tsStripped.code) {
        result = tsStripped.code;
        result = result.replace(pureAnnotationComment, "/*#__PURE__*/");
      }
    }
  }

  // Apply isServer/isBrowser const replacement
  if (
    opts.isServer !== undefined &&
    (result.includes("@qwik.dev/core") || result.includes("@builder.io/qwik"))
  ) {
    result = applySegmentConstReplacement(result, filename, opts.isServer);
  }

  // Dead code elimination
  if (hasSegmentDcePatterns(result)) {
    result = applySegmentDCE(result);
  }

  // Side-effect simplification for unused variable bindings
  const exportIdx = result.indexOf("export const ");
  const afterExportLine = exportIdx >= 0 ? result.indexOf("\n", exportIdx) : -1;
  if (afterExportLine >= 0 && result.indexOf("const ", afterExportLine) >= 0) {
    result = applySegmentSideEffectSimplification(result, filename);
  }

  // HMR injection for component$ segments
  if (
    opts.emitMode === "hmr" &&
    opts.devFile &&
    (opts.ctxName === "component$" ||
      opts.ctxName === "componentQrl" ||
      opts.ctxName === "component")
  ) {
    result = injectUseHmr(result, opts.devFile);
  }

  // Clean up unused imports
  if (result.includes("\nimport ")) {
    result = removeUnusedImports(result, filename);
  }

  return result;
}
